from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from ..database import get_db
from ..models import Korisnik
from ..schemas import Token, KorisnikOut
from ..auth import verify_password, create_access_token, get_current_user, role_value
from ..config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    username = form_data.username.strip()
    user = db.query(Korisnik).filter(func.lower(Korisnik.username) == username.lower()).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Pogrešan username ili lozinka")
    if not user.aktivan:
        raise HTTPException(status_code=403, detail="Korisnički račun nije aktivan")

    user.zadnja_prijava = datetime.utcnow()
    db.commit()

    token = create_access_token(
        data={"sub": user.username},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    rola = role_value(user.rola)
    return {
        "access_token": token,
        "token_type": "bearer",
        "rola": rola,
        "role": rola,
        "ime": user.ime,
        "prezime": user.prezime,
        "user_id": user.id
    }

@router.get("/me", response_model=KorisnikOut)
def get_me(current_user: Korisnik = Depends(get_current_user)):
    return current_user
