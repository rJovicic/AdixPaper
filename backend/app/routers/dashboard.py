from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import datetime
from typing import List, Optional

from ..database import get_db
from ..models import Oprema, Kvar, Korisnik, StatusKvaraEnum, PrioritetEnum, SLA_SATI, KomponentaOpreme, KvarRezervniDio, RezervniDio, Dobavljac
from ..schemas import DashboardStats, KvaroviPoMjesecu, TopOpremaKvarovi, KvaroviPoStatusu, KvaroviPoPrioritetu, TopKomponentaKvarovi, SparePartUsageSummary
from ..auth import require_voditelj_or_admin

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

MJESECI = ["", "Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"]
OPEN_STATUSES = [StatusKvaraEnum.novo, StatusKvaraEnum.u_rjesavanju, StatusKvaraEnum.na_cekanju]


def _enum_value(value) -> str:
    raw = getattr(value, "value", value)
    return str(raw) if raw is not None else ""


def _sla_ratio(kvar: Kvar, now: datetime) -> Optional[float]:
    if kvar.status == StatusKvaraEnum.rijeseno or not kvar.datum_prijave:
        return None
    limit = SLA_SATI.get(_enum_value(kvar.prioritet))
    if not limit:
        return None
    elapsed = (now - kvar.datum_prijave.replace(tzinfo=None)).total_seconds() / 3600
    return elapsed / limit


@router.get("/stats", response_model=DashboardStats)
def get_stats(db: Session = Depends(get_db), _: Korisnik = Depends(require_voditelj_or_admin)):
    now = datetime.utcnow()

    ukupno_kvarova = db.query(func.count(Kvar.id)).scalar() or 0
    ukupno_opreme = db.query(func.count(Oprema.id)).scalar() or 0
    aktivna = db.query(func.count(Oprema.id)).filter(Oprema.status == "Aktivno").scalar() or 0
    neispravna = db.query(func.count(Oprema.id)).filter(Oprema.status == "Neispravno").scalar() or 0
    na_servisu = db.query(func.count(Oprema.id)).filter(Oprema.status == "Na servisu").scalar() or 0

    otvoreni = db.query(func.count(Kvar.id)).filter(Kvar.status.in_(OPEN_STATUSES)).scalar() or 0
    u_rjesavanju = db.query(func.count(Kvar.id)).filter(Kvar.status == StatusKvaraEnum.u_rjesavanju).scalar() or 0
    rijeseni_svi = db.query(func.count(Kvar.id)).filter(Kvar.status == StatusKvaraEnum.rijeseno).scalar() or 0

    hitni = db.query(func.count(Kvar.id)).filter(
        Kvar.prioritet == PrioritetEnum.hitno,
        Kvar.status.in_(OPEN_STATUSES)
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

    zastoj_min = db.query(func.coalesce(func.sum(Kvar.trajanje_min), 0)).scalar() or 0
    dijelovi_mjesec = db.query(
        func.coalesce(func.sum(KvarRezervniDio.kolicina * func.coalesce(RezervniDio.cijena, 0)), 0)
    ).join(Kvar, KvarRezervniDio.kvar_id == Kvar.id).join(
        RezervniDio, KvarRezervniDio.rezervni_dio_id == RezervniDio.id
    ).filter(
        extract('month', Kvar.datum_prijave) == now.month,
        extract('year', Kvar.datum_prijave) == now.year
    ).scalar() or 0

    broj_radnika = db.query(func.count(Korisnik.id)).filter(Korisnik.aktivan == True).scalar() or 0
    otvoreni_records = db.query(Kvar).filter(Kvar.status.in_(OPEN_STATUSES)).all()
    sla_ratios = [_sla_ratio(k, now) for k in otvoreni_records]
    sla_kasni = len([r for r in sla_ratios if r is not None and r >= 1])
    sla_uskoro = len([r for r in sla_ratios if r is not None and 0.75 <= r < 1])

    rijeseni_records = db.query(Kvar).filter(
        Kvar.status == StatusKvaraEnum.rijeseno,
        Kvar.datum_prijave.isnot(None),
        Kvar.datum_rjesavanja.isnot(None),
        extract('month', Kvar.datum_rjesavanja) == now.month,
        extract('year', Kvar.datum_rjesavanja) == now.year
    ).all()
    trajanja = [
        (k.datum_rjesavanja.replace(tzinfo=None) - k.datum_prijave.replace(tzinfo=None)).total_seconds() / 60
        for k in rijeseni_records
    ]
    prosjek_min = sum(trajanja) / len(trajanja) if trajanja else 0

    return DashboardStats(
        ukupno_kvarova=ukupno_kvarova,
        ukupno_opreme=ukupno_opreme,
        aktivna_oprema=aktivna,
        neispravna_oprema=neispravna,
        na_servisu=na_servisu,
        otvoreni_kvarovi=otvoreni,
        u_rjesavanju_kvarovi=u_rjesavanju,
        rijeseni_kvarovi=rijeseni_svi,
        kvarovi_danas=kvarovi_danas,
        rijeseni_ovaj_mjesec=rijeseni_mjesec,
        ukupni_troskovi_ovaj_mjesec=float(troskovi_mjesec),
        ukupni_troskovi_godina=float(troskovi_godina),
        broj_radnika=broj_radnika,
        hitni_kvarovi=hitni,
        ukupni_zastoj_min=int(zastoj_min or 0),
        rezervni_dijelovi_ovaj_mjesec=float(dijelovi_mjesec or 0),
        sla_kasni=sla_kasni,
        sla_uskoro=sla_uskoro,
        prosjecno_vrijeme_rjesavanja_min=round(prosjek_min, 1)
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


@router.get("/kvarovi-po-prioritetu", response_model=List[KvaroviPoPrioritetu])
def get_kvarovi_po_prioritetu(db: Session = Depends(get_db), _: Korisnik = Depends(require_voditelj_or_admin)):
    result = db.query(
        Kvar.prioritet,
        func.count(Kvar.id).label('broj')
    ).group_by(Kvar.prioritet).all()

    return [KvaroviPoPrioritetu(prioritet=r.prioritet.value, broj=r.broj) for r in result]


@router.get("/top-komponente", response_model=List[TopKomponentaKvarovi])
def get_top_komponente(db: Session = Depends(get_db), _: Korisnik = Depends(require_voditelj_or_admin)):
    result = db.query(
        KomponentaOpreme.naziv,
        Oprema.naziv.label("oprema"),
        func.count(Kvar.id).label("broj_kvarova"),
    ).join(Kvar, KomponentaOpreme.id == Kvar.komponenta_id).join(
        Oprema, KomponentaOpreme.oprema_id == Oprema.id
    ).group_by(
        KomponentaOpreme.id, KomponentaOpreme.naziv, Oprema.naziv
    ).order_by(func.count(Kvar.id).desc()).limit(10).all()

    return [
        TopKomponentaKvarovi(naziv=r.naziv, oprema=r.oprema, broj_kvarova=r.broj_kvarova)
        for r in result
    ]


@router.get("/utrosak-dijelova", response_model=List[SparePartUsageSummary])
def get_utrosak_dijelova(db: Session = Depends(get_db), _: Korisnik = Depends(require_voditelj_or_admin)):
    result = db.query(
        RezervniDio.naziv,
        RezervniDio.sifra,
        Dobavljac.naziv.label("dobavljac"),
        func.coalesce(RezervniDio.cijena, 0).label("cijena"),
        func.sum(KvarRezervniDio.kolicina).label("kolicina"),
    ).join(KvarRezervniDio, RezervniDio.id == KvarRezervniDio.rezervni_dio_id).join(
        Dobavljac, RezervniDio.dobavljac_id == Dobavljac.id
    ).group_by(
        RezervniDio.id, RezervniDio.naziv, RezervniDio.sifra, RezervniDio.cijena, Dobavljac.naziv
    ).order_by(func.sum(KvarRezervniDio.kolicina).desc()).limit(10).all()

    items = []
    for r in result:
        qty = float(r.kolicina or 0)
        price = float(r.cijena or 0)
        items.append(SparePartUsageSummary(
            naziv=r.naziv,
            sifra=r.sifra,
            dobavljac=r.dobavljac,
            kolicina=qty,
            trosak=qty * price,
        ))
    return items
