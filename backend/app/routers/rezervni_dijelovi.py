from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Optional

from ..database import get_db
from ..models import Dobavljac, Korisnik, RezervniDio
from ..schemas import (
    DobavljacCreate,
    DobavljacOut,
    DobavljacUpdate,
    RezervniDioCreate,
    RezervniDioOut,
    RezervniDioUpdate,
)
from ..auth import require_voditelj_or_admin

router = APIRouter(prefix="/api/rezervni-dijelovi", tags=["rezervni-dijelovi"])


def _clean_required(value: str, field: str) -> str:
    text = (value or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail=f"{field} je obavezan")
    return text


@router.get("/dobavljaci", response_model=List[DobavljacOut])
def list_dobavljaci(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _: Korisnik = Depends(require_voditelj_or_admin),
):
    q = db.query(Dobavljac)
    if not include_inactive:
        q = q.filter(Dobavljac.aktivan == True)
    return q.order_by(Dobavljac.naziv).all()


@router.post("/dobavljaci", response_model=DobavljacOut, status_code=201)
def create_dobavljac(
    data: DobavljacCreate,
    db: Session = Depends(get_db),
    _: Korisnik = Depends(require_voditelj_or_admin),
):
    naziv = _clean_required(data.naziv, "Naziv dobavljača")
    exists = db.query(Dobavljac).filter(func.lower(Dobavljac.naziv) == naziv.lower()).first()
    if exists:
        raise HTTPException(status_code=400, detail="Dobavljač već postoji")
    dobavljac = Dobavljac(naziv=naziv, oznaka=data.oznaka, aktivan=data.aktivan)
    db.add(dobavljac)
    db.commit()
    db.refresh(dobavljac)
    return dobavljac


@router.put("/dobavljaci/{dobavljac_id}", response_model=DobavljacOut)
def update_dobavljac(
    dobavljac_id: int,
    data: DobavljacUpdate,
    db: Session = Depends(get_db),
    _: Korisnik = Depends(require_voditelj_or_admin),
):
    dobavljac = db.query(Dobavljac).filter(Dobavljac.id == dobavljac_id).first()
    if not dobavljac:
        raise HTTPException(status_code=404, detail="Dobavljač nije pronađen")
    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "naziv" and value is not None:
            value = _clean_required(value, "Naziv dobavljača")
        setattr(dobavljac, field, value)
    db.commit()
    db.refresh(dobavljac)
    return dobavljac


@router.get("", response_model=List[RezervniDioOut])
def list_rezervni_dijelovi(
    search: Optional[str] = Query(None),
    dobavljac_id: Optional[int] = Query(None),
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _: Korisnik = Depends(require_voditelj_or_admin),
):
    q = db.query(RezervniDio).options(joinedload(RezervniDio.dobavljac))
    if not include_inactive:
        q = q.filter(RezervniDio.aktivan == True)
    if dobavljac_id:
        q = q.filter(RezervniDio.dobavljac_id == dobavljac_id)
    if search:
        pattern = f"%{search.strip()}%"
        q = q.filter(RezervniDio.naziv.ilike(pattern) | RezervniDio.sifra.ilike(pattern))
    return q.order_by(RezervniDio.naziv).all()


@router.post("", response_model=RezervniDioOut, status_code=201)
def create_rezervni_dio(
    data: RezervniDioCreate,
    db: Session = Depends(get_db),
    _: Korisnik = Depends(require_voditelj_or_admin),
):
    if data.dobavljac_id and not db.query(Dobavljac.id).filter(Dobavljac.id == data.dobavljac_id).first():
        raise HTTPException(status_code=404, detail="Dobavljač nije pronađen")
    dio = RezervniDio(
        naziv=_clean_required(data.naziv, "Naziv dijela"),
        sifra=(data.sifra or "").strip() or None,
        dobavljac_id=data.dobavljac_id,
        jedinica=(data.jedinica or "kom").strip() or "kom",
        zaliha=data.zaliha,
        cijena=data.cijena,
        aktivan=data.aktivan,
    )
    db.add(dio)
    db.commit()
    db.refresh(dio)
    return db.query(RezervniDio).options(joinedload(RezervniDio.dobavljac)).filter(RezervniDio.id == dio.id).first()


@router.put("/{dio_id}", response_model=RezervniDioOut)
def update_rezervni_dio(
    dio_id: int,
    data: RezervniDioUpdate,
    db: Session = Depends(get_db),
    _: Korisnik = Depends(require_voditelj_or_admin),
):
    dio = db.query(RezervniDio).filter(RezervniDio.id == dio_id).first()
    if not dio:
        raise HTTPException(status_code=404, detail="Rezervni dio nije pronađen")
    update_data = data.model_dump(exclude_unset=True)
    if "dobavljac_id" in update_data and update_data["dobavljac_id"]:
        if not db.query(Dobavljac.id).filter(Dobavljac.id == update_data["dobavljac_id"]).first():
            raise HTTPException(status_code=404, detail="Dobavljač nije pronađen")
    for field, value in update_data.items():
        if field == "naziv" and value is not None:
            value = _clean_required(value, "Naziv dijela")
        if field in ("sifra", "jedinica") and value is not None:
            value = value.strip() or ("kom" if field == "jedinica" else None)
        setattr(dio, field, value)
    db.commit()
    db.refresh(dio)
    return db.query(RezervniDio).options(joinedload(RezervniDio.dobavljac)).filter(RezervniDio.id == dio.id).first()


@router.delete("/{dio_id}", status_code=204)
def deactivate_rezervni_dio(
    dio_id: int,
    db: Session = Depends(get_db),
    _: Korisnik = Depends(require_voditelj_or_admin),
):
    dio = db.query(RezervniDio).filter(RezervniDio.id == dio_id).first()
    if not dio:
        raise HTTPException(status_code=404, detail="Rezervni dio nije pronađen")
    dio.aktivan = False
    db.commit()
