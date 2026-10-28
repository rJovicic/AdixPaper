import asyncio
import time

import jwt
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

from ..auth import get_user_from_token, oauth2_scheme, role_value
from ..config import settings
from ..database import SessionLocal
from ..live import HEARTBEAT_SECONDS, broker, format_event

router = APIRouter(prefix="/api/uzivo", tags=["uzivo"])

# Railway's edge ends HTTP requests after 15 minutes even while data flows; ending the stream
# ourselves first makes the reconnect a planned, quiet one (the browser re-reads its views).
MAX_STREAM_SECONDS = 600


def _authenticate(token: str):
    """(user id, is manager) for a valid token; raises 401 like every other endpoint."""
    db = SessionLocal()
    try:
        user = get_user_from_token(token, db)
        return user.id, role_value(user.rola) in ("admin", "voditelj")
    finally:
        db.close()


def _still_valid(token: str) -> bool:
    try:
        _authenticate(token)
        return True
    except Exception:
        return False


def _expires_at(token: str) -> float:
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    return float(payload.get("exp") or 0)


@router.get("")
async def stream(request: Request, token: str = Depends(oauth2_scheme)):
    """Server-Sent Events: `hello` once, then `kvar` events ({seq, kvar_id, akcija}) and a heartbeat.

    The browser sends its bearer token in the Authorization header (fetch, not EventSource), so
    tokens never appear in URLs or access logs. The stream ends with `auth` when the session
    expires or is revoked, and with `resync` when the client fell too far behind.
    """
    user_id, manager = await run_in_threadpool(_authenticate, token)
    expires_at = _expires_at(token)
    heartbeat = getattr(request.app.state, "live_heartbeat", HEARTBEAT_SECONDS)

    async def events():
        subscriber = broker.subscribe(user_id, manager)
        started = time.monotonic()
        try:
            yield "retry: 3000\n\n"
            yield format_event("hello", {"uloga": "voditelj" if manager else "radnik"})
            while True:
                if subscriber.overflowed:
                    yield format_event("resync", {})
                    return
                try:
                    event = await asyncio.wait_for(subscriber.queue.get(), timeout=heartbeat)
                    yield format_event("kvar", event)
                    continue
                except asyncio.TimeoutError:
                    pass
                if await request.is_disconnected() or time.monotonic() - started >= MAX_STREAM_SECONDS:
                    return
                if time.time() >= expires_at or not await run_in_threadpool(_still_valid, token):
                    yield format_event("auth", {})
                    return
                yield ": ping\n\n"
        finally:
            broker.unsubscribe(subscriber)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )
