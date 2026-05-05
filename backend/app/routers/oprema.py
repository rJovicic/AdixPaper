from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from ..database import get_db
from ..models import Oprema, Kvar, Korisnik, KomponentaOpreme
from ..schemas import OpremaCreate, OpremaOut, OpremaUpdate, OpremaWithStats, KomponentaCreate, KomponentaUpdate, KomponentaOut
from ..auth import get_current_user, require_admin, require_voditelj_or_admin

router = APIRouter(prefix="/api/oprema", tags=["oprema"])

@router.get("", response_model=List[OpremaWithStats])
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
            func.count(Kvar.id).label("broj"),
            func.coalesce(func.sum(Kvar.troskovi), 0).label("troskovi"),
            func.max(Kvar.datum_prijave).label("zadnji")
        ).filter(Kvar.oprema_id == o.id).first()

        item = OpremaWithStats.model_validate(o)
        item.broj_kvarova = stats.broj or 0
        item.ukupni_troskovi = float(stats.troskovi or 0)
        item.zadnji_kvar = stats.zadnji
        result.append(item)

    return result

@router.get("/{oprema_id}", response_model=OpremaWithStats)
def get_oprema_by_id(oprema_id: int, db: Session = Depends(get_db), _: Korisnik = Depends(get_current_user)):
    o = db.query(Oprema).filter(Oprema.id == oprema_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Oprema nije pronađena")

    stats = db.query(
        func.count(Kvar.id).label("broj"),
        func.coalesce(func.sum(Kvar.troskovi), 0).label("troskovi"),
        func.max(Kvar.datum_prijave).label("zadnji")
    ).filter(Kvar.oprema_id == o.id).first()

    item = OpremaWithStats.model_validate(o)
    item.broj_kvarova = stats.broj or 0
    item.ukupni_troskovi = float(stats.troskovi or 0)
    item.zadnji_kvar = stats.zadnji
    return item

@router.post("", response_model=OpremaOut)
def create_oprema(data: OpremaCreate, db: Session = Depends(get_db), _: Korisnik = Depends(require_voditelj_or_admin)):
    if data.serijski_broj and db.query(Oprema).filter(Oprema.serijski_broj == data.serijski_broj).first():
        raise HTTPException(status_code=400, detail="Serijski broj već postoji")

    oprema = Oprema(**data.model_dump())
    db.add(oprema)
    db.commit()
    db.refresh(oprema)
    return oprema

@router.put("/{oprema_id}", response_model=OpremaOut)
def update_oprema(oprema_id: int, data: OpremaUpdate, db: Session = Depends(get_db), _: Korisnik = Depends(require_voditelj_or_admin)):
    oprema = db.query(Oprema).filter(Oprema.id == oprema_id).first()
    if not oprema:
        raise HTTPException(status_code=404, detail="Oprema nije pronađena")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(oprema, field, value)

    db.commit()
    db.refresh(oprema)
    return oprema


@router.get("/{oprema_id}/komponente", response_model=List[KomponentaOut])
def get_komponente(oprema_id: int, db: Session = Depends(get_db), _: Korisnik = Depends(get_current_user)):
    if not db.query(Oprema.id).filter(Oprema.id == oprema_id).first():
        raise HTTPException(status_code=404, detail="Oprema nije pronađena")
    return db.query(KomponentaOpreme).filter(
        KomponentaOpreme.oprema_id == oprema_id
    ).order_by(KomponentaOpreme.naziv).all()


@router.post("/{oprema_id}/komponente", response_model=KomponentaOut, status_code=201)
def create_komponenta(
    oprema_id: int,
    data: KomponentaCreate,
    db: Session = Depends(get_db),
    _: Korisnik = Depends(require_voditelj_or_admin)
):
    if not db.query(Oprema.id).filter(Oprema.id == oprema_id).first():
        raise HTTPException(status_code=404, detail="Oprema nije pronađena")
    naziv = data.naziv.strip()
    if not naziv:
        raise HTTPException(status_code=400, detail="Naziv komponente je obavezan")
    komponenta = KomponentaOpreme(
        oprema_id=oprema_id,
        naziv=naziv,
        opis=data.opis,
        aktivna=data.aktivna,
    )
    db.add(komponenta)
    db.commit()
    db.refresh(komponenta)
    return komponenta


@router.put("/komponente/{komponenta_id}", response_model=KomponentaOut)
def update_komponenta(
    komponenta_id: int,
    data: KomponentaUpdate,
    db: Session = Depends(get_db),
    _: Korisnik = Depends(require_voditelj_or_admin)
):
    komponenta = db.query(KomponentaOpreme).filter(KomponentaOpreme.id == komponenta_id).first()
    if not komponenta:
        raise HTTPException(status_code=404, detail="Komponenta nije pronađena")
    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "naziv" and value is not None:
            value = value.strip()
            if not value:
                raise HTTPException(status_code=400, detail="Naziv komponente je obavezan")
        setattr(komponenta, field, value)
    db.commit()
    db.refresh(komponenta)
    return komponenta


@router.delete("/komponente/{komponenta_id}", status_code=204)
def delete_komponenta(
    komponenta_id: int,
    db: Session = Depends(get_db),
    _: Korisnik = Depends(require_voditelj_or_admin)
):
    komponenta = db.query(KomponentaOpreme).filter(KomponentaOpreme.id == komponenta_id).first()
    if not komponenta:
        raise HTTPException(status_code=404, detail="Komponenta nije pronađena")
    if db.query(Kvar.id).filter(Kvar.komponenta_id == komponenta_id).first():
        komponenta.aktivna = False
    else:
        db.delete(komponenta)
    db.commit()

@router.delete("/{oprema_id}")
def delete_oprema(oprema_id: int, db: Session = Depends(get_db), _: Korisnik = Depends(require_admin)):
    oprema = db.query(Oprema).filter(Oprema.id == oprema_id).first()
    if not oprema:
        raise HTTPException(status_code=404, detail="Oprema nije pronađena")
    db.delete(oprema)
    db.commit()
    return {"detail": "Oprema obrisana"}
