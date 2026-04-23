from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Odrzavanje, Oprema, Korisnik
from ..schemas import OdrzavanjeCreate, OdrzavanjeOut, OdrzavanjeUpdate
from ..auth import get_current_user, require_admin

router = APIRouter(prefix="/api/odrzavanje", tags=["odrzavanje"])

def enrich(o: Odrzavanje, db: Session) -> OdrzavanjeOut:
    out = OdrzavanjeOut.model_validate(o)
    if o.oprema:
        out.oprema_naziv = o.oprema.naziv
    if o.izvodioc:
        out.izvodioc_ime = f"{o.izvodioc.ime} {o.izvodioc.prezime}"
    return out

@router.get("/", response_model=List[OdrzavanjeOut])
def get_odrzavanja(
    oprema_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    izvodioc_id: Optional[int] = Query(None),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    _: Korisnik = Depends(get_current_user)
):
    query = db.query(Odrzavanje)
    if oprema_id:
        query = query.filter(Odrzavanje.oprema_id == oprema_id)
    if status:
        query = query.filter(Odrzavanje.status == status)
    if izvodioc_id:
        query = query.filter(Odrzavanje.izvodioc_id == izvodioc_id)

    records = query.order_by(Odrzavanje.datum.desc()).limit(limit).all()
    return [enrich(r, db) for r in records]

@router.get("/moje", response_model=List[OdrzavanjeOut])
def get_moja_odrzavanja(db: Session = Depends(get_db), current_user: Korisnik = Depends(get_current_user)):
    records = db.query(Odrzavanje).filter(
        Odrzavanje.izvodioc_id == current_user.id
    ).order_by(Odrzavanje.datum.desc()).limit(50).all()
    return [enrich(r, db) for r in records]

@router.get("/{record_id}", response_model=OdrzavanjeOut)
def get_odrzavanje(record_id: int, db: Session = Depends(get_db), _: Korisnik = Depends(get_current_user)):
    o = db.query(Odrzavanje).filter(Odrzavanje.id == record_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Zapis nije pronađen")
    return enrich(o, db)

@router.post("/", response_model=OdrzavanjeOut)
def create_odrzavanje(data: OdrzavanjeCreate, db: Session = Depends(get_db), current_user: Korisnik = Depends(get_current_user)):
    if not db.query(Oprema).filter(Oprema.id == data.oprema_id).first():
        raise HTTPException(status_code=404, detail="Oprema nije pronađena")

    record = Odrzavanje(**data.model_dump(), kreirao_id=current_user.id)
    db.add(record)

    # Ažuriraj status opreme ako je kvar
    if data.vrsta_odrzavanja in ["Popravak kvara", "Elektro kvar"]:
        oprema = db.query(Oprema).filter(Oprema.id == data.oprema_id).first()
        if data.status and data.status.value == "U tijeku":
            oprema.status = "Na servisu"
        elif data.status and data.status.value == "Završeno":
            oprema.status = "Aktivno"

    db.commit()
    db.refresh(record)
    return enrich(record, db)

@router.put("/{record_id}", response_model=OdrzavanjeOut)
def update_odrzavanje(record_id: int, data: OdrzavanjeUpdate, db: Session = Depends(get_db), _: Korisnik = Depends(get_current_user)):
    record = db.query(Odrzavanje).filter(Odrzavanje.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Zapis nije pronađen")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(record, field, value)

    db.commit()
    db.refresh(record)
    return enrich(record, db)

@router.delete("/{record_id}")
def delete_odrzavanje(record_id: int, db: Session = Depends(get_db), _: Korisnik = Depends(require_admin)):
    record = db.query(Odrzavanje).filter(Odrzavanje.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Zapis nije pronađen")
    db.delete(record)
    db.commit()
    return {"detail": "Zapis obrisan"}
