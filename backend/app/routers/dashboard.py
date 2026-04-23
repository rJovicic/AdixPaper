from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import date, datetime
from typing import List
from ..database import get_db
from ..models import Oprema, Odrzavanje, Korisnik
from ..schemas import DashboardStats, TroskoviPoMjesecu, OdrzavanjePoVrsti, TopOpremaKvarovi
from ..auth import require_admin

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

MJESECI = ["", "Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"]

@router.get("/stats", response_model=DashboardStats)
def get_stats(db: Session = Depends(get_db), _: Korisnik = Depends(require_admin)):
    now = datetime.utcnow()

    ukupno_opreme = db.query(func.count(Oprema.id)).scalar()
    aktivna = db.query(func.count(Oprema.id)).filter(Oprema.status == "Aktivno").scalar()
    neispravna = db.query(func.count(Oprema.id)).filter(Oprema.status == "Neispravno").scalar()
    na_servisu = db.query(func.count(Oprema.id)).filter(Oprema.status == "Na servisu").scalar()

    ukupno_odrzavanja = db.query(func.count(Odrzavanje.id)).scalar()
    odrzavanja_mjesec = db.query(func.count(Odrzavanje.id)).filter(
        extract('month', Odrzavanje.datum) == now.month,
        extract('year', Odrzavanje.datum) == now.year
    ).scalar()

    troskovi_mjesec = db.query(func.coalesce(func.sum(Odrzavanje.troskovi), 0)).filter(
        extract('month', Odrzavanje.datum) == now.month,
        extract('year', Odrzavanje.datum) == now.year
    ).scalar()

    troskovi_godina = db.query(func.coalesce(func.sum(Odrzavanje.troskovi), 0)).filter(
        extract('year', Odrzavanje.datum) == now.year
    ).scalar()

    broj_radnika = db.query(func.count(Korisnik.id)).filter(Korisnik.aktivan == True).scalar()

    return DashboardStats(
        ukupno_opreme=ukupno_opreme or 0,
        aktivna_oprema=aktivna or 0,
        neispravna_oprema=neispravna or 0,
        na_servisu=na_servisu or 0,
        ukupno_odrzavanja=ukupno_odrzavanja or 0,
        odrzavanja_ovaj_mjesec=odrzavanja_mjesec or 0,
        ukupni_troskovi_ovaj_mjesec=float(troskovi_mjesec or 0),
        ukupni_troskovi_godina=float(troskovi_godina or 0),
        broj_radnika=broj_radnika or 0
    )

@router.get("/troskovi-po-mjesecu", response_model=List[TroskoviPoMjesecu])
def get_troskovi_po_mjesecu(db: Session = Depends(get_db), _: Korisnik = Depends(require_admin)):
    now = datetime.utcnow()
    result = db.query(
        extract('month', Odrzavanje.datum).label('mj'),
        func.coalesce(func.sum(Odrzavanje.troskovi), 0).label('troskovi'),
        func.count(Odrzavanje.id).label('broj')
    ).filter(
        extract('year', Odrzavanje.datum) == now.year
    ).group_by('mj').order_by('mj').all()

    return [
        TroskoviPoMjesecu(
            mjesec=MJESECI[int(r.mj)],
            troskovi=float(r.troskovi),
            broj_odrzavanja=r.broj
        ) for r in result
    ]

@router.get("/odrzavanje-po-vrsti", response_model=List[OdrzavanjePoVrsti])
def get_odrzavanje_po_vrsti(db: Session = Depends(get_db), _: Korisnik = Depends(require_admin)):
    result = db.query(
        Odrzavanje.vrsta_odrzavanja.label('vrsta'),
        func.count(Odrzavanje.id).label('broj')
    ).group_by(Odrzavanje.vrsta_odrzavanja).order_by(func.count(Odrzavanje.id).desc()).all()

    return [OdrzavanjePoVrsti(vrsta=r.vrsta, broj=r.broj) for r in result]

@router.get("/top-kvarovi", response_model=List[TopOpremaKvarovi])
def get_top_kvarovi(db: Session = Depends(get_db), _: Korisnik = Depends(require_admin)):
    result = db.query(
        Oprema.naziv,
        Oprema.lokacija,
        func.count(Odrzavanje.id).label('broj_kvarova'),
        func.coalesce(func.sum(Odrzavanje.troskovi), 0).label('ukupni_troskovi')
    ).join(Odrzavanje, Oprema.id == Odrzavanje.oprema_id).group_by(
        Oprema.id, Oprema.naziv, Oprema.lokacija
    ).order_by(func.count(Odrzavanje.id).desc()).limit(10).all()

    return [
        TopOpremaKvarovi(
            naziv=r.naziv,
            lokacija=r.lokacija,
            broj_kvarova=r.broj_kvarova,
            ukupni_troskovi=float(r.ukupni_troskovi)
        ) for r in result
    ]

@router.get("/aktivnost-radnika")
def get_aktivnost_radnika(db: Session = Depends(get_db), _: Korisnik = Depends(require_admin)):
    now = datetime.utcnow()
    result = db.query(
        Korisnik.ime,
        Korisnik.prezime,
        func.count(Odrzavanje.id).label('broj_odrzavanja'),
        func.coalesce(func.sum(Odrzavanje.trajanje), 0).label('ukupno_minuta')
    ).join(Odrzavanje, Korisnik.id == Odrzavanje.izvodioc_id).filter(
        extract('year', Odrzavanje.datum) == now.year
    ).group_by(Korisnik.id, Korisnik.ime, Korisnik.prezime).order_by(
        func.count(Odrzavanje.id).desc()
    ).limit(20).all()

    return [
        {
            "ime": f"{r.ime} {r.prezime}",
            "broj_odrzavanja": r.broj_odrzavanja,
            "ukupno_sati": round(r.ukupno_minuta / 60, 1)
        } for r in result
    ]
