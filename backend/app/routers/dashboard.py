from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import datetime
from typing import List

from ..database import get_db
from ..models import Oprema, Kvar, Korisnik, StatusKvaraEnum, PrioritetEnum
from ..schemas import DashboardStats, KvaroviPoMjesecu, TopOpremaKvarovi, KvaroviPoStatusu
from ..auth import require_voditelj_or_admin

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

MJESECI = ["", "Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"]


@router.get("/stats", response_model=DashboardStats)
def get_stats(db: Session = Depends(get_db), _: Korisnik = Depends(require_voditelj_or_admin)):
    now = datetime.utcnow()

    ukupno_opreme = db.query(func.count(Oprema.id)).scalar() or 0
    aktivna = db.query(func.count(Oprema.id)).filter(Oprema.status == "Aktivno").scalar() or 0
    neispravna = db.query(func.count(Oprema.id)).filter(Oprema.status == "Neispravno").scalar() or 0
    na_servisu = db.query(func.count(Oprema.id)).filter(Oprema.status == "Na servisu").scalar() or 0

    otvoreni = db.query(func.count(Kvar.id)).filter(
        Kvar.status.in_([StatusKvaraEnum.novo, StatusKvaraEnum.u_rjesavanju, StatusKvaraEnum.na_cekanju])
    ).scalar() or 0

    hitni = db.query(func.count(Kvar.id)).filter(
        Kvar.prioritet == PrioritetEnum.hitno,
        Kvar.status.in_([StatusKvaraEnum.novo, StatusKvaraEnum.u_rjesavanju, StatusKvaraEnum.na_cekanju])
    ).scalar() or 0

    kvarovi_danas = db.query(func.count(Kvar.id)).filter(
        extract('day', Kvar.datum_prijave) == now.day,
        extract('month', Kvar.datum_prijave) == now.month,
        extract('year', Kvar.datum_prijave) == now.year
    ).scalar() or 0

    rijeseni_mjesec = db.query(func.count(Kvar.id)).filter(
        Kvar.status == StatusKvaraEnum.rijeseno,
        extract('month', Kvar.datum_rjesavanja) == now.month,
        extract('year', Kvar.datum_rjesavanja) == now.year
    ).scalar() or 0

    troskovi_mjesec = db.query(func.coalesce(func.sum(Kvar.troskovi), 0)).filter(
        Kvar.status == StatusKvaraEnum.rijeseno,
        extract('month', Kvar.datum_rjesavanja) == now.month,
        extract('year', Kvar.datum_rjesavanja) == now.year
    ).scalar() or 0

    troskovi_godina = db.query(func.coalesce(func.sum(Kvar.troskovi), 0)).filter(
        Kvar.status == StatusKvaraEnum.rijeseno,
        extract('year', Kvar.datum_rjesavanja) == now.year
    ).scalar() or 0

    broj_radnika = db.query(func.count(Korisnik.id)).filter(Korisnik.aktivan == True).scalar() or 0

    return DashboardStats(
        ukupno_opreme=ukupno_opreme,
        aktivna_oprema=aktivna,
        neispravna_oprema=neispravna,
        na_servisu=na_servisu,
        otvoreni_kvarovi=otvoreni,
        kvarovi_danas=kvarovi_danas,
        rijeseni_ovaj_mjesec=rijeseni_mjesec,
        ukupni_troskovi_ovaj_mjesec=float(troskovi_mjesec),
        ukupni_troskovi_godina=float(troskovi_godina),
        broj_radnika=broj_radnika,
        hitni_kvarovi=hitni
    )


@router.get("/kvarovi-po-mjesecu", response_model=List[KvaroviPoMjesecu])
def get_kvarovi_po_mjesecu(db: Session = Depends(get_db), _: Korisnik = Depends(require_voditelj_or_admin)):
    now = datetime.utcnow()

    ukupno_result = db.query(
        extract('month', Kvar.datum_prijave).label('mj'),
        func.count(Kvar.id).label('ukupno')
    ).filter(
        extract('year', Kvar.datum_prijave) == now.year
    ).group_by('mj').all()

    rijeseno_result = db.query(
        extract('month', Kvar.datum_rjesavanja).label('mj'),
        func.count(Kvar.id).label('rijeseno'),
        func.coalesce(func.sum(Kvar.troskovi), 0).label('troskovi')
    ).filter(
        Kvar.status == StatusKvaraEnum.rijeseno,
        extract('year', Kvar.datum_rjesavanja) == now.year
    ).group_by('mj').all()

    rijeseno_map = {int(r.mj): (r.rijeseno, float(r.troskovi)) for r in rijeseno_result}
    ukupno_map = {int(r.mj): r.ukupno for r in ukupno_result}
    all_months = sorted(set(list(ukupno_map.keys()) + list(rijeseno_map.keys())))

    return [
        KvaroviPoMjesecu(
            mjesec=MJESECI[m],
            ukupno=ukupno_map.get(m, 0),
            rijeseno=rijeseno_map.get(m, (0, 0))[0],
            troskovi=rijeseno_map.get(m, (0, 0))[1]
        ) for m in all_months
    ]


@router.get("/top-oprema", response_model=List[TopOpremaKvarovi])
def get_top_oprema(db: Session = Depends(get_db), _: Korisnik = Depends(require_voditelj_or_admin)):
    result = db.query(
        Oprema.naziv,
        Oprema.lokacija,
        func.count(Kvar.id).label('broj_kvarova'),
        func.coalesce(func.sum(Kvar.troskovi), 0).label('ukupni_troskovi')
    ).join(Kvar, Oprema.id == Kvar.oprema_id).group_by(
        Oprema.id, Oprema.naziv, Oprema.lokacija
    ).order_by(func.count(Kvar.id).desc()).limit(10).all()

    return [
        TopOpremaKvarovi(
            naziv=r.naziv,
            lokacija=r.lokacija,
            broj_kvarova=r.broj_kvarova,
            ukupni_troskovi=float(r.ukupni_troskovi)
        ) for r in result
    ]


@router.get("/kvarovi-po-statusu", response_model=List[KvaroviPoStatusu])
def get_kvarovi_po_statusu(db: Session = Depends(get_db), _: Korisnik = Depends(require_voditelj_or_admin)):
    result = db.query(
        Kvar.status,
        func.count(Kvar.id).label('broj')
    ).group_by(Kvar.status).all()

    return [KvaroviPoStatusu(status=r.status.value, broj=r.broj) for r in result]
