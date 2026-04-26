from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from ..database import get_db
from ..models import Korisnik, RolaEnum
from ..schemas import Token, KorisnikCreate, KorisnikOut
from ..auth import verify_password, get_password_hash, create_access_token, get_current_user, role_value
from ..config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(Korisnik).filter(Korisnik.username == form_data.username).first()
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

@router.post("/register", response_model=KorisnikOut)
def register_first_admin(user_data: KorisnikCreate, db: Session = Depends(get_db)):
    # Samo ako nema ni jednog admina
    admin_count = db.query(Korisnik).filter(Korisnik.rola == RolaEnum.admin).count()
    if admin_count > 0:
        raise HTTPException(status_code=400, detail="Registracija nije dostupna. Kontaktirajte admina.")

    existing = db.query(Korisnik).filter(Korisnik.username == user_data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username već postoji")

    user = Korisnik(
        username=user_data.username,
        ime=user_data.ime,
        prezime=user_data.prezime,
        email=user_data.email,
        telefon=user_data.telefon,
        odjel=user_data.odjel,
        hashed_password=get_password_hash(user_data.password),
        rola=RolaEnum.admin
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
