from datetime import datetime, timedelta
from typing import Optional
import bcrypt
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from .database import get_db
from .models import Korisnik
from .config import settings

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
        raise HTTPException(status_code=400, detail=str(exc))

def _password_bytes(password: str) -> bytes:
    value = (password or "").encode("utf-8")
    if len(value) > MAX_BCRYPT_PASSWORD_BYTES:
        raise ValueError("Lozinka je predugačka. Koristite najviše 72 bajta.")
    return value

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Korisnik:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Neispravni podaci za prijavu",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(Korisnik).filter(Korisnik.username == username, Korisnik.aktivan == True).first()
    if user is None:
        raise credentials_exception
    return user

def require_admin(current_user: Korisnik = Depends(get_current_user)) -> Korisnik:
    if role_value(current_user.rola) != "admin":
        raise HTTPException(status_code=403, detail="Pristup zabranjen - potrebne admin ovlasti")
    return current_user

def require_voditelj_or_admin(current_user: Korisnik = Depends(get_current_user)) -> Korisnik:
    if role_value(current_user.rola) not in ("voditelj", "admin"):
        raise HTTPException(status_code=403, detail="Pristup zabranjen - potrebne voditelj ili admin ovlasti")
    return current_user
