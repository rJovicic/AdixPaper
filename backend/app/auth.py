from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from .database import get_db
from .models import Korisnik
from .config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

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
    if current_user.rola.value != "admin":
        raise HTTPException(status_code=403, detail="Pristup zabranjen - potrebne admin ovlasti")
    return current_user

def require_voditelj_or_admin(current_user: Korisnik = Depends(get_current_user)) -> Korisnik:
    if current_user.rola.value not in ("voditelj", "admin"):
        raise HTTPException(status_code=403, detail="Pristup zabranjen - potrebne voditelj ili admin ovlasti")
    return current_user
