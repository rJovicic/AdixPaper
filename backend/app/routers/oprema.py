from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from ..database import get_db
from ..models import Oprema, Odrzavanje, Korisnik
from ..schemas import OpremaCreate, OpremaOut, OpremaUpdate, OpremaWithStats
from ..auth import get_current_user, require_admin

router = APIRouter(prefix="/api/oprema", tags=["oprema"])

@router.get("/", response_model=List[OpremaWithStats])
def get_oprema(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    tvrtka: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: Korisnik = Depends(get_current_user)
):
    query = db.query(Oprema)
    if search:
        query = query.filter(
            Oprema.naziv.ilike(f"%{search}%") |
            Oprema.tip.ilike(f"%{search}%") |
            Oprema.serijski_broj.ilike(f"%{search}%") |
            Oprema.lokacija.ilike(f"%{search}%")
        )
    if status:
        query = query.filter(Oprema.status == status)
    if tvrtka:
        query = query.filter(Oprema.tvrtka == tvrtka)

    oprema_list = query.order_by(Oprema.naziv).all()

    result = []
    for o in oprema_list:
        stats = db.query(
            func.count(Odrzavanje.id).label("broj"),
            func.coalesce(func.sum(Odrzavanje.troskovi), 0).label("troskovi"),
            func.max(Odrzavanje.datum).label("zadnje")
        ).filter(Odrzavanje.oprema_id == o.id).first()

        item = OpremaWithStats.model_validate(o)
        item.broj_odrzavanja = stats.broj or 0
        item.ukupni_troskovi = float(stats.troskovi or 0)
        item.zadnje_odrzavanje = stats.zadnje
        result.append(item)

    return result

@router.get("/{oprema_id}", response_model=OpremaWithStats)
def get_oprema_by_id(oprema_id: int, db: Session = Depends(get_db), _: Korisnik = Depends(get_current_user)):
    o = db.query(Oprema).filter(Oprema.id == oprema_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Oprema nije pronađena")

    stats = db.query(
        func.count(Odrzavanje.id).label("broj"),
        func.coalesce(func.sum(Odrzavanje.troskovi), 0).label("troskovi"),
        func.max(Odrzavanje.datum).label("zadnje")
    ).filter(Odrzavanje.oprema_id == o.id).first()

    item = OpremaWithStats.model_validate(o)
    item.broj_odrzavanja = stats.broj or 0
    item.ukupni_troskovi = float(stats.troskovi or 0)
    item.zadnje_odrzavanje = stats.zadnje
    return item

@router.post("/", response_model=OpremaOut)
def create_oprema(data: OpremaCreate, db: Session = Depends(get_db), _: Korisnik = Depends(get_current_user)):
    if data.serijski_broj and db.query(Oprema).filter(Oprema.serijski_broj == data.serijski_broj).first():
        raise HTTPException(status_code=400, detail="Serijski broj već postoji")

    oprema = Oprema(**data.model_dump())
    db.add(oprema)
    db.commit()
    db.refresh(oprema)
    return oprema

@router.put("/{oprema_id}", response_model=OpremaOut)
def update_oprema(oprema_id: int, data: OpremaUpdate, db: Session = Depends(get_db), _: Korisnik = Depends(get_current_user)):
    oprema = db.query(Oprema).filter(Oprema.id == oprema_id).first()
    if not oprema:
        raise HTTPException(status_code=404, detail="Oprema nije pronađena")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(oprema, field, value)

    db.commit()
    db.refresh(oprema)
    return oprema

@router.delete("/{oprema_id}")
def delete_oprema(oprema_id: int, db: Session = Depends(get_db), _: Korisnik = Depends(require_admin)):
    oprema = db.query(Oprema).filter(Oprema.id == oprema_id).first()
    if not oprema:
        raise HTTPException(status_code=404, detail="Oprema nije pronađena")
    db.delete(oprema)
    db.commit()
    return {"detail": "Oprema obrisana"}
