from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from datetime import datetime
from typing import List, Optional

from ..database import get_db
from ..models import Oprema, Kvar, Korisnik, KvarDogadjaj, RolaEnum, StatusKvaraEnum, PrioritetEnum, SLA_SATI, KomponentaOpreme, KvarRezervniDio, RezervniDio, Dobavljac
from ..schemas import Pregled, PregledAktivnost, PregledKpi, PregledOpterecenje, KorisnikMini, DashboardStats, KvaroviPoMjesecu, TopOpremaKvarovi, KvaroviPoStatusu, KvaroviPoPrioritetu, TopKomponentaKvarovi, SparePartUsageSummary
from ..auth import require_voditelj_or_admin
from ..timeutil import utcnow, as_utc, local_day_start, local_month_start, local_year_start, local_month_number, period_start

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
    elapsed = (now - as_utc(kvar.datum_prijave)).total_seconds() / 3600
    return elapsed / limit


ACTIVITY_ROWS = 8


@router.get("/pregled", response_model=Pregled)
def get_pregled(
    period: str = "7d",
    db: Session = Depends(get_db),
    _: Korisnik = Depends(require_voditelj_or_admin),
):
    """The overview: open work by state, workload per lead, recent activity.

    Open counts are "now" and ignore the period; the period applies only to "reported" and
    "resolved". Every count matches the fault list it links to.
    """
    now = utcnow()
    od = period_start(period, now)
    if od is None:
        raise HTTPException(status_code=422, detail="Neispravna vrijednost filtra")

    open_faults = db.query(Kvar).options(joinedload(Kvar.voditelj)).filter(Kvar.status.in_(OPEN_STATUSES)).all()
    reasons = {k.id: k.razlozi_paznje_u(now) for k in open_faults}
    kpi = PregledKpi(
        otvoreni=len(open_faults),
        hitni=sum(1 for k in open_faults if k.prioritet == PrioritetEnum.hitno),
        kasni=sum(1 for k in open_faults if "kasni" in reasons[k.id]),
        nedodijeljeni=sum(1 for k in open_faults if not k.voditelj_id),
        novi=sum(1 for k in open_faults if k.status == StatusKvaraEnum.novo),
        u_rjesavanju=sum(1 for k in open_faults if k.status == StatusKvaraEnum.u_rjesavanju),
        na_cekanju=sum(1 for k in open_faults if k.status == StatusKvaraEnum.na_cekanju),
        ceka_dijelove=sum(1 for k in open_faults if k.status == StatusKvaraEnum.na_cekanju and k.razlog_cekanja == "dijelovi"),
        prijavljeni_u_periodu=db.query(func.count(Kvar.id)).filter(Kvar.datum_prijave >= od).scalar() or 0,
        rijeseni_u_periodu=db.query(func.count(Kvar.id)).filter(
            Kvar.status == StatusKvaraEnum.rijeseno, Kvar.datum_rjesavanja >= od
        ).scalar() or 0,
    )

    # Every active lead and admin, including those with nothing assigned: who is free matters too.
    people = db.query(Korisnik).filter(
        Korisnik.aktivan == True, Korisnik.rola.in_([RolaEnum.voditelj, RolaEnum.admin])  # noqa: E712
    ).order_by(Korisnik.ime, Korisnik.prezime).all()
    load = {p.id: {"otvoreni": 0, "u_rjesavanju": 0, "na_cekanju": 0, "kasni": 0} for p in people}
    for k in open_faults:
        row = load.get(k.voditelj_id)
        if row is None:
            continue
        row["otvoreni"] += 1
        if k.status == StatusKvaraEnum.u_rjesavanju:
            row["u_rjesavanju"] += 1
        if k.status == StatusKvaraEnum.na_cekanju:
            row["na_cekanju"] += 1
        if "kasni" in reasons[k.id]:
            row["kasni"] += 1
    opterecenje = sorted(
        (PregledOpterecenje(korisnik=KorisnikMini.model_validate(p), **load[p.id]) for p in people),
        key=lambda row: (-row.otvoreni, row.korisnik.ime),
    )

    events = (
        db.query(KvarDogadjaj)
        .options(joinedload(KvarDogadjaj.korisnik), joinedload(KvarDogadjaj.kvar))
        .order_by(KvarDogadjaj.kreiran.desc(), KvarDogadjaj.id.desc())
        .limit(ACTIVITY_ROWS)
        .all()
    )
    aktivnosti = [
        PregledAktivnost(
            id=e.id,
            kvar_id=e.kvar_id,
            kvar_naslov=e.kvar.naslov if e.kvar else "",
            tip=e.tip,
            naslov=e.naslov,
            opis=(e.opis[:160] + "…") if e.opis and len(e.opis) > 160 else e.opis,
            podaci=e.podaci,
            interno=e.interno,
            kreiran=e.kreiran,
            korisnik=KorisnikMini.model_validate(e.korisnik) if e.korisnik else None,
        )
        for e in events
    ]
    return Pregled(od=od, do=now, kpi=kpi, opterecenje=opterecenje, aktivnosti=aktivnosti)


@router.get("/stats", response_model=DashboardStats)
def get_stats(db: Session = Depends(get_db), _: Korisnik = Depends(require_voditelj_or_admin)):
    now = utcnow()
    day_start = local_day_start(now)
    month_start = local_month_start(now)
    year_start = local_year_start(now)

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

    kvarovi_danas = db.query(func.count(Kvar.id)).filter(Kvar.datum_prijave >= day_start).scalar() or 0

    rijeseni_mjesec = db.query(func.count(Kvar.id)).filter(
        Kvar.status == StatusKvaraEnum.rijeseno,
        Kvar.datum_rjesavanja >= month_start
    ).scalar() or 0

    troskovi_mjesec = db.query(func.coalesce(func.sum(Kvar.troskovi), 0)).filter(
        Kvar.status == StatusKvaraEnum.rijeseno,
        Kvar.datum_rjesavanja >= month_start
    ).scalar() or 0

    troskovi_godina = db.query(func.coalesce(func.sum(Kvar.troskovi), 0)).filter(
        Kvar.status == StatusKvaraEnum.rijeseno,
        Kvar.datum_rjesavanja >= year_start
    ).scalar() or 0

    zastoj_min = db.query(func.coalesce(func.sum(Kvar.trajanje_min), 0)).scalar() or 0
    zastoj_mjesec = db.query(func.coalesce(func.sum(Kvar.trajanje_min), 0)).filter(
        Kvar.status == StatusKvaraEnum.rijeseno,
        Kvar.datum_rjesavanja >= month_start,
    ).scalar() or 0
    dijelovi_mjesec = db.query(
        func.coalesce(func.sum(KvarRezervniDio.kolicina * func.coalesce(RezervniDio.cijena, 0)), 0)
    ).join(Kvar, KvarRezervniDio.kvar_id == Kvar.id).join(
        RezervniDio, KvarRezervniDio.rezervni_dio_id == RezervniDio.id
    ).filter(
        Kvar.datum_prijave >= month_start
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
        Kvar.datum_rjesavanja >= month_start
    ).all()
    trajanja = [
        (as_utc(k.datum_rjesavanja) - as_utc(k.datum_prijave)).total_seconds() / 60
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
        zastoj_ovaj_mjesec_min=int(zastoj_mjesec or 0),
        rezervni_dijelovi_ovaj_mjesec=float(dijelovi_mjesec or 0),
        sla_kasni=sla_kasni,
        sla_uskoro=sla_uskoro,
        prosjecno_vrijeme_rjesavanja_min=round(prosjek_min, 1)
    )


@router.get("/kvarovi-po-mjesecu", response_model=List[KvaroviPoMjesecu])
def get_kvarovi_po_mjesecu(db: Session = Depends(get_db), _: Korisnik = Depends(require_voditelj_or_admin)):
    year_start = local_year_start()
    prijave = db.query(Kvar.datum_prijave).filter(Kvar.datum_prijave >= year_start).all()
    rijeseni = db.query(Kvar.datum_rjesavanja, Kvar.troskovi).filter(
        Kvar.status == StatusKvaraEnum.rijeseno,
        Kvar.datum_rjesavanja >= year_start,
    ).all()

    months = {}
    for (datum,) in prijave:
        row = months.setdefault(local_month_number(datum), {"ukupno": 0, "rijeseno": 0, "troskovi": 0.0})
        row["ukupno"] += 1
    for datum, troskovi in rijeseni:
        row = months.setdefault(local_month_number(datum), {"ukupno": 0, "rijeseno": 0, "troskovi": 0.0})
        row["rijeseno"] += 1
        row["troskovi"] += float(troskovi or 0)

    return [
        KvaroviPoMjesecu(mjesec=MJESECI[m], ukupno=v["ukupno"], rijeseno=v["rijeseno"], troskovi=v["troskovi"])
        for m, v in sorted(months.items())
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
    ).join(KvarRezervniDio, RezervniDio.id == KvarRezervniDio.rezervni_dio_id).outerjoin(
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
