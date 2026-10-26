from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import Korisnik
from ..schemas import KorisnikCreate, KorisnikOut, KorisnikUpdate
from ..auth import get_password_hash, require_admin, require_voditelj_or_admin, role_value

router = APIRouter(prefix="/api/korisnici", tags=["korisnici"])

@router.get("", response_model=List[KorisnikOut])
def get_korisnici(db: Session = Depends(get_db), _: Korisnik = Depends(require_admin)):
    return db.query(Korisnik).order_by(Korisnik.prezime).all()

@router.post("", response_model=KorisnikOut)
def create_korisnik(data: KorisnikCreate, db: Session = Depends(get_db), _: Korisnik = Depends(require_admin)):
    if db.query(Korisnik).filter(func.lower(Korisnik.username) == data.username.lower()).first():
        raise HTTPException(status_code=400, detail="Korisničko ime već postoji")
    if data.email and db.query(Korisnik).filter(Korisnik.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email već postoji")

    user = Korisnik(
        username=data.username,
        ime=data.ime,
        prezime=data.prezime,
        email=data.email,
        telefon=data.telefon,
        odjel=data.odjel,
        hashed_password=get_password_hash(data.password),
        rola=data.rola
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.put("/{user_id}", response_model=KorisnikOut)
def update_korisnik(user_id: int, data: KorisnikUpdate, db: Session = Depends(get_db), current_user: Korisnik = Depends(require_admin)):
    user = db.query(Korisnik).filter(Korisnik.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Korisnik nije pronađen")

    update_data = data.model_dump(exclude_unset=True)
    if user.id == current_user.id:
        if update_data.get("aktivan") is False:
            raise HTTPException(status_code=400, detail="Ne možete deaktivirati vlastiti račun")
        if "rola" in update_data and role_value(update_data["rola"]) != "admin":
            raise HTTPException(status_code=400, detail="Ne možete ukloniti admin ovlasti vlastitom računu")
    if update_data.get("email") and db.query(Korisnik.id).filter(Korisnik.email == update_data["email"], Korisnik.id != user_id).first():
        raise HTTPException(status_code=400, detail="Email već postoji")

    for field, value in update_data.items():
        if field == "password" and value:
            user.hashed_password = get_password_hash(value)
        elif field != "password":
            setattr(user, field, value)

    db.commit()
    db.refresh(user)
    return user

@router.delete("/{user_id}")
def delete_korisnik(user_id: int, db: Session = Depends(get_db), current_user: Korisnik = Depends(require_admin)):
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Ne možete obrisati vlastiti račun")
    user = db.query(Korisnik).filter(Korisnik.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Korisnik nije pronađen")
    user.aktivan = False
    db.commit()
    return {"detail": "Korisnik deaktiviran"}

@router.get("/radnici/lista", response_model=List[KorisnikOut])
def get_radnici(db: Session = Depends(get_db), _: Korisnik = Depends(require_voditelj_or_admin)):
    return db.query(Korisnik).filter(Korisnik.aktivan == True).order_by(Korisnik.prezime).all()
