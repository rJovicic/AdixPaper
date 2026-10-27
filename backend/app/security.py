"""HTTP hardening: security headers and a small in-process login throttle."""
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

# The SPA is self-contained (bundled JS/CSS/fonts); inline styles are used by charts.
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; "
    "manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
)
DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")
# The largest legitimate body is a 12 MB photo plus multipart framing. Checked before the body is read:
# Starlette would otherwise spool any upload to disk before the endpoint's own size check runs.
MAX_BODY_BYTES = 13 * 1024 * 1024
TOO_LARGE = "Fotografija je prevelika (najviše 12 MB)"


def body_too_large(request: Request) -> bool:
    if request.method not in ("POST", "PUT", "PATCH"):
        return False
    length = request.headers.get("content-length")
    if length is None:
        # Uploads must declare their size; JSON bodies without a length are left to the parser.
        return request.headers.get("content-type", "").startswith("multipart/")
    return not length.isdigit() or int(length) > MAX_BODY_BYTES


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if body_too_large(request):
            response = JSONResponse({"detail": TOO_LARGE}, status_code=413)
        else:
            response = await call_next(request)
        headers = response.headers
        headers.setdefault("X-Content-Type-Options", "nosniff")
        headers.setdefault("X-Frame-Options", "DENY")
        headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if not request.url.path.startswith(DOCS_PATHS):
            # Swagger UI loads assets from a CDN, so it is exempt from the strict policy.
            headers.setdefault("Content-Security-Policy", CONTENT_SECURITY_POLICY)
        if request.url.scheme == "https":
            headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response


class LoginThrottle:
    """Limits failed sign-ins per client IP and username, and per username overall.

    The client IP comes from X-Forwarded-For, which a client can forge, so the
    per-username cap is what actually bounds password guessing. The trade-off: someone
    can lock a username out for one window by failing on purpose.

    State lives in process memory, which matches the single-replica deployment;
    a restart clears it.
    """

    ANY_IP = "*"

    def __init__(self, max_failures: int = 10, window_seconds: int = 900, max_failures_per_user: int = 20):
        self.max_failures = max_failures
        self.max_failures_per_user = max_failures_per_user
        self.window = window_seconds
        self._failures: dict[tuple[str, str], deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def _key(self, request: Request, username: str) -> tuple[str, str]:
        client = request.client.host if request.client else "unknown"
        return client, username.strip().lower()

    def _prune(self, attempts: deque, now: float):
        while attempts and now - attempts[0] > self.window:
            attempts.popleft()

    def _user_key(self, username: str) -> tuple[str, str]:
        return self.ANY_IP, username.strip().lower()

    def check(self, request: Request, username: str):
        now = time.monotonic()
        with self._lock:
            for key, limit in ((self._key(request, username), self.max_failures), (self._user_key(username), self.max_failures_per_user)):
                attempts = self._failures[key]
                self._prune(attempts, now)
                if len(attempts) >= limit:
                    retry_after = int(self.window - (now - attempts[0])) + 1
                    raise HTTPException(
                        status_code=429,
                        detail="Previše neuspješnih prijava. Pokušajte ponovno za nekoliko minuta.",
                        headers={"Retry-After": str(retry_after)},
                    )

    def record_failure(self, request: Request, username: str):
        now = time.monotonic()
        with self._lock:
            self._failures[self._key(request, username)].append(now)
            self._failures[self._user_key(username)].append(now)

    def reset(self, request: Request, username: str):
        with self._lock:
            self._failures.pop(self._key(request, username), None)


login_throttle = LoginThrottle()
