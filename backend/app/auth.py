from datetime import timedelta
from typing import Optional
import bcrypt
import jwt
from jwt import InvalidTokenError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from .database import get_db
from .models import Korisnik
from .config import settings
from .timeutil import as_utc, utcnow

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
MAX_BCRYPT_PASSWORD_BYTES = 72

def role_value(role) -> str:
    if role is None:
        return ""
    value = getattr(role, "value", role)
    return str(value).strip().lower().split(".")[-1]

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(_password_bytes(plain_password), hashed_password.encode("utf-8"))
    except (TypeError, ValueError):
        return False

def get_password_hash(password: str) -> str:
    try:
        return bcrypt.hashpw(_password_bytes(password), bcrypt.gensalt()).decode("utf-8")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None

def _password_bytes(password: str) -> bytes:
    value = (password or "").encode("utf-8")
    if len(value) > MAX_BCRYPT_PASSWORD_BYTES:
        raise ValueError("Lozinka je predugačka. Koristite najviše 72 bajta.")
    return value

_dummy_hash: Optional[str] = None


def verify_password_or_dummy(user: Optional[Korisnik], plain_password: str) -> bool:
    """Checks a password; for an unknown user still spends one bcrypt check so the
    response time does not reveal which usernames exist."""
    global _dummy_hash
    if user is None:
        if _dummy_hash is None:
            _dummy_hash = bcrypt.hashpw(b"unused-password", bcrypt.gensalt()).decode("utf-8")
        verify_password(plain_password, _dummy_hash)
        return False
    return verify_password(plain_password, user.hashed_password)


def set_password(user: Korisnik, password: str) -> None:
    """Stores a new password and signs the user out everywhere else."""
    user.hashed_password = get_password_hash(password)
    user.sesije_od = utcnow()


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    now = utcnow()
    expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "iat": now.timestamp()})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def get_user_from_token(token: str, db: Session) -> Korisnik:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Neispravni podaci za prijavu",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        issued_at = payload.get("iat")
        if username is None:
            raise credentials_exception
    except InvalidTokenError:
        raise credentials_exception from None

    user = db.query(Korisnik).filter(Korisnik.username == username, Korisnik.aktivan == True).first()
    if user is None:
        raise credentials_exception from None
    if user.sesije_od is not None:
        # Tokens issued before the last password change are revoked; tokens without iat
        # predate this check and are treated the same way.
        if not isinstance(issued_at, (int, float)) or issued_at < as_utc(user.sesije_od).timestamp():
            raise credentials_exception
    return user

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Korisnik:
    return get_user_from_token(token, db)

def require_admin(current_user: Korisnik = Depends(get_current_user)) -> Korisnik:
    if role_value(current_user.rola) != "admin":
        raise HTTPException(status_code=403, detail="Pristup zabranjen - potrebne admin ovlasti")
    return current_user

def require_voditelj_or_admin(current_user: Korisnik = Depends(get_current_user)) -> Korisnik:
    if role_value(current_user.rola) not in ("voditelj", "admin"):
        raise HTTPException(status_code=403, detail="Pristup zabranjen - potrebne voditelj ili admin ovlasti")
    return current_user
