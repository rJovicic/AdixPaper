from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from datetime import datetime, timedelta
from collections import defaultdict
from typing import List

from ..database import get_db
from ..models import Oprema, Kvar, Korisnik, KvarDogadjaj, RolaEnum, StatusKvaraEnum, PrioritetEnum, KomponentaOpreme, KvarRezervniDio, RezervniDio, Dobavljac
from ..schemas import Analitika, AnalitikaCekanje, AnalitikaKomponenta, AnalitikaStatus, AnalitikaDio, AnalitikaMasina, AnalitikaPonavljanje, AnalitikaPrioritet, AnalitikaSazetak, Pregled, PregledAktivnost, PregledKpi, PregledOpterecenje, KorisnikMini, DashboardStats, KvaroviPoMjesecu, TopOpremaKvarovi, KvaroviPoStatusu, KvaroviPoPrioritetu, TopKomponentaKvarovi, SparePartUsageSummary
from ..auth import require_voditelj_or_admin
from ..timeutil import utcnow, as_utc, local_day_start, local_month_start, local_year_start, local_month_number, period_start

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

MJESECI = ["", "Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"]
OPEN_STATUSES = [StatusKvaraEnum.novo, StatusKvaraEnum.u_rjesavanju, StatusKvaraEnum.na_cekanju]


def _enum_value(value) -> str:
    raw = getattr(value, "value", value)
    return str(raw) if raw is not None else ""


ACTIVITY_ROWS = 8
OPEN_VALUES = {s.value for s in OPEN_STATUSES}


def _open_counts_at(db: Session, at: datetime) -> dict:
    """Open, urgent and on-hold counts as they stood at `at`.

    A fault's status and priority at `at` are the "old" values of its first status/priority change
    after `at`, or its current values when nothing changed since. Faults resolved before `at` and
    untouched since are left out by the query.
    """
    candidates = db.query(Kvar.id, Kvar.status, Kvar.prioritet).filter(
        Kvar.datum_prijave <= at,
        (Kvar.status.in_(OPEN_STATUSES)) | (Kvar.datum_rjesavanja.is_(None)) | (Kvar.datum_rjesavanja > at),
    ).all()
    state = {row.id: {"status": _enum_value(row.status), "prioritet": _enum_value(row.prioritet)} for row in candidates}
    if not state:
        return {"otvoreni": 0, "hitni": 0, "na_cekanju": 0}
    changes = db.query(KvarDogadjaj.kvar_id, KvarDogadjaj.tip, KvarDogadjaj.podaci).filter(
        KvarDogadjaj.kreiran > at,
        KvarDogadjaj.tip.in_(["status", "prioritet"]),
        KvarDogadjaj.kvar_id.in_(list(state)),
    ).order_by(KvarDogadjaj.kreiran.asc(), KvarDogadjaj.id.asc()).all()
    undone = set()
    for kvar_id, tip, podaci in changes:
        if (kvar_id, tip) in undone or not podaci or not podaci.get("old"):
            continue
        undone.add((kvar_id, tip))
        state[kvar_id][tip] = podaci["old"]
    open_then = [s for s in state.values() if s["status"] in OPEN_VALUES]
    return {
        "otvoreni": len(open_then),
        "hitni": sum(1 for s in open_then if s["prioritet"] == PrioritetEnum.hitno.value),
        "na_cekanju": sum(1 for s in open_then if s["status"] == StatusKvaraEnum.na_cekanju.value),
    }


def _resolved_between(db: Session, start: datetime, end: datetime) -> int:
    return db.query(func.count(Kvar.id)).filter(
        Kvar.status == StatusKvaraEnum.rijeseno, Kvar.datum_rjesavanja >= start, Kvar.datum_rjesavanja < end
    ).scalar() or 0


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
    week_ago = _open_counts_at(db, now - timedelta(days=7))
    today = local_day_start(now)
    yesterday = local_day_start(today - timedelta(hours=12))
    kpi = PregledKpi(
        otvoreni_prije_tjedan=week_ago["otvoreni"],
        hitni_prije_tjedan=week_ago["hitni"],
        na_cekanju_prije_tjedan=week_ago["na_cekanju"],
        rijeseni_danas=_resolved_between(db, today, now + timedelta(seconds=1)),
        rijeseni_jucer=_resolved_between(db, yesterday, today),
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
        .options(joinedload(KvarDogadjaj.korisnik), joinedload(KvarDogadjaj.kvar).joinedload(Kvar.oprema))
        .order_by(KvarDogadjaj.kreiran.desc(), KvarDogadjaj.id.desc())
        .limit(ACTIVITY_ROWS)
        .all()
    )
    aktivnosti = [
        PregledAktivnost(
            id=e.id,
            kvar_id=e.kvar_id,
            kvar_naslov=e.kvar.naslov if e.kvar else "",
            oprema_naziv=e.kvar.oprema.naziv if e.kvar and e.kvar.oprema else None,
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


RECURRING_MIN = 3  # faults on the same machine part within the period that count as "recurring"


def _minutes(start, end) -> float:
    return (as_utc(end) - as_utc(start)).total_seconds() / 60


def _mean(values):
    values = list(values)
    return round(sum(values) / len(values), 1) if values else None


def _summary(db: Session, od: datetime, do: datetime) -> AnalitikaSazetak:
    """Headline figures for [od, do). Definitions are shown on the Analytics page (analytics.defs).

    Response window: judged for the faults reported in the period. On time = first response
    within the window; late = first response after it, or none yet with the window passed.
    Faults still inside their window without a response are not judged yet, nor are faults whose
    first response predates the record of it (no datum_odziva, not waiting).
    """
    now = utcnow()
    reported_faults = db.query(Kvar).filter(Kvar.datum_prijave >= od, Kvar.datum_prijave < do).all()
    resolved = db.query(Kvar).filter(
        Kvar.status == StatusKvaraEnum.rijeseno, Kvar.datum_rjesavanja >= od, Kvar.datum_rjesavanja < do
    ).all()
    responded = db.query(Kvar.datum_prijave, Kvar.datum_odziva).filter(
        Kvar.datum_odziva >= od, Kvar.datum_odziva < do, Kvar.datum_prijave.isnot(None)
    ).all()
    on_time = sum(1 for k in reported_faults if k.odziv_u_roku is True)
    late = sum(
        1 for k in reported_faults
        if k.odziv_u_roku is False or (k.ceka_odziv and k.rok is not None and k.rok < now)
    )
    parts_cost = 0.0
    if resolved:
        # Unit prices recorded when the parts were used, never today's catalogue price.
        parts_cost = db.query(
            func.coalesce(func.sum(KvarRezervniDio.kolicina * func.coalesce(KvarRezervniDio.jedinicna_cijena, 0)), 0)
        ).filter(KvarRezervniDio.kvar_id.in_([k.id for k in resolved])).scalar() or 0
    return AnalitikaSazetak(
        prijavljeno=len(reported_faults),
        rijeseno=len(resolved),
        vrijeme_do_rjesenja_min=_mean(_minutes(k.datum_prijave, k.datum_rjesavanja) for k in resolved if k.datum_prijave),
        vrijeme_do_odziva_min=_mean(_minutes(prijava, odziv) for prijava, odziv in responded),
        vrijeme_popravka_min=_mean(_minutes(k.datum_pocetka, k.datum_rjesavanja) for k in resolved if k.datum_pocetka),
        sla_u_roku=on_time,
        sla_ocijenjeno=on_time + late,
        sla_postotak=round(100 * on_time / (on_time + late), 1) if on_time + late else None,
        zastoj_min=sum(k.trajanje_min or 0 for k in resolved),
        zastoj_evidentiran=sum(1 for k in resolved if (k.trajanje_min or 0) > 0),
        trosak_rada=float(sum(k.troskovi or 0 for k in resolved)),
        trosak_dijelova=float(parts_cost),
    )


@router.get("/analitika", response_model=Analitika)
def get_analitika(
    period: str = "30d",
    db: Session = Depends(get_db),
    _: Korisnik = Depends(require_voditelj_or_admin),
):
    """Maintenance performance for a period, with the same figures for the period before it."""
    now = utcnow()
    od = period_start(period, now)
    if od is None:
        raise HTTPException(status_code=422, detail="Neispravna vrijednost filtra")
    before = od - (now - od)

    reported = db.query(Kvar).options(joinedload(Kvar.oprema), joinedload(Kvar.komponenta)).filter(Kvar.datum_prijave >= od).all()

    # Spare-part cost per fault at the recorded unit prices, so a machine's cost is labour + parts.
    part_costs = dict(
        db.query(KvarRezervniDio.kvar_id, func.sum(KvarRezervniDio.kolicina * func.coalesce(KvarRezervniDio.jedinicna_cijena, 0)))
        .filter(KvarRezervniDio.kvar_id.in_([k.id for k in reported]))
        .group_by(KvarRezervniDio.kvar_id)
        .all()
    ) if reported else {}

    by_machine = defaultdict(list)
    for k in reported:
        by_machine[k.oprema_id].append(k)
    masine = []
    for faults in by_machine.values():
        machine = faults[0].oprema
        times = sorted(as_utc(k.datum_prijave) for k in faults)
        masine.append(AnalitikaMasina(
            oprema_id=machine.id,
            naziv=machine.naziv,
            lokacija=machine.lokacija,
            kvarovi=len(faults),
            # Of those, reported against the machine as a whole (no component); the rest name a component.
            na_cijeloj_masini=sum(1 for k in faults if not k.komponenta_id),
            zastoj_min=sum(k.trajanje_min or 0 for k in faults),
            trosak=float(sum((k.troskovi or 0) + (part_costs.get(k.id) or 0) for k in faults)),
            vrijeme_do_rjesenja_min=_mean(_minutes(k.datum_prijave, k.datum_rjesavanja) for k in faults if k.datum_rjesavanja),
            # Mean gap between consecutive reports in the period: a proxy for MTBF (operating hours are not recorded).
            mtbf_sati=round((times[-1] - times[0]).total_seconds() / 3600 / (len(times) - 1), 1) if len(times) > 1 else None,
        ))
    masine.sort(key=lambda row: (-row.kvarovi, -row.zastoj_min, row.naziv))

    # The same faults by component (faults on a whole machine are not in this list). Each fault is
    # counted once: under its component here, and under its machine above.
    by_component = defaultdict(list)
    for k in reported:
        if k.komponenta_id:
            by_component[k.komponenta_id].append(k)
    komponente = sorted(
        (
            AnalitikaKomponenta(
                komponenta_id=faults[0].komponenta_id,
                naziv=faults[0].komponenta.naziv if faults[0].komponenta else "",
                oprema_id=faults[0].oprema_id,
                oprema=faults[0].oprema.naziv if faults[0].oprema else "",
                model=faults[0].komponenta.model if faults[0].komponenta else None,
                kvarovi=len(faults),
                zastoj_min=sum(k.trajanje_min or 0 for k in faults),
                trosak=float(sum((k.troskovi or 0) + (part_costs.get(k.id) or 0) for k in faults)),
                vrijeme_do_rjesenja_min=_mean(_minutes(k.datum_prijave, k.datum_rjesavanja) for k in faults if k.datum_rjesavanja),
            )
            for faults in by_component.values()
        ),
        key=lambda row: (-row.kvarovi, -row.zastoj_min, row.naziv),
    )

    recurring = defaultdict(list)
    for k in reported:
        if k.komponenta_id:
            recurring[(k.oprema_id, k.komponenta_id)].append(k)
    ponavljanja = sorted(
        (
            AnalitikaPonavljanje(
                oprema_id=faults[0].oprema_id,
                oprema=faults[0].oprema.naziv,
                komponenta=faults[0].komponenta.naziv if faults[0].komponenta else None,
                kvarovi=len(faults),
                zadnji=max(k.datum_prijave for k in faults),
            )
            for faults in recurring.values() if len(faults) >= RECURRING_MIN
        ),
        key=lambda row: (-row.kvarovi, row.oprema),
    )

    # Completed waits: logged on the status change that ended them (podaci.cekanje_min / cekanje_razlog).
    waits = defaultdict(lambda: {"broj": 0, "ukupno_min": 0, "trenutno": 0})
    for (podaci,) in db.query(KvarDogadjaj.podaci).filter(KvarDogadjaj.tip == "status", KvarDogadjaj.kreiran >= od).all():
        if podaci and podaci.get("cekanje_razlog") and podaci.get("cekanje_min") is not None:
            row = waits[podaci["cekanje_razlog"]]
            row["broj"] += 1
            row["ukupno_min"] += int(podaci["cekanje_min"])
    for (reason,) in db.query(Kvar.razlog_cekanja).filter(Kvar.status == StatusKvaraEnum.na_cekanju, Kvar.razlog_cekanja.isnot(None)).all():
        waits[reason]["trenutno"] += 1
    cekanje = sorted(
        (AnalitikaCekanje(razlog=reason, **row) for reason, row in waits.items()),
        key=lambda row: (-row.ukupno_min, -row.trenutno),
    )

    parts = db.query(
        RezervniDio.naziv,
        RezervniDio.sifra,
        func.sum(KvarRezervniDio.kolicina).label("kolicina"),
        func.sum(KvarRezervniDio.kolicina * func.coalesce(KvarRezervniDio.jedinicna_cijena, 0)).label("trosak"),
    ).join(KvarRezervniDio, RezervniDio.id == KvarRezervniDio.rezervni_dio_id).join(
        Kvar, KvarRezervniDio.kvar_id == Kvar.id
    ).filter(
        Kvar.status == StatusKvaraEnum.rijeseno, Kvar.datum_rjesavanja >= od
    ).group_by(RezervniDio.id, RezervniDio.naziv, RezervniDio.sifra).order_by(
        func.sum(KvarRezervniDio.kolicina).desc()
    ).limit(10).all()

    priorities = defaultdict(int)
    statuses = defaultdict(int)
    for k in reported:
        priorities[_enum_value(k.prioritet)] += 1
        statuses[_enum_value(k.status)] += 1

    return Analitika(
        od=od,
        do=now,
        sazetak=_summary(db, od, now),
        prethodno=_summary(db, before, od),
        masine=masine[:10],
        komponente=komponente[:10],
        cekanje=cekanje,
        ponavljanja=ponavljanja[:10],
        dijelovi=[AnalitikaDio(naziv=r.naziv, sifra=r.sifra, kolicina=float(r.kolicina or 0), trosak=float(r.trosak or 0)) for r in parts],
        po_prioritetu=[AnalitikaPrioritet(prioritet=p, broj=priorities[p]) for p in ("Hitno", "Normalno", "Nisko")],
        # Where the faults reported in the period stand now.
        po_statusu=[AnalitikaStatus(status=s.value, broj=statuses[s.value]) for s in StatusKvaraEnum],
    )


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
        func.coalesce(func.sum(KvarRezervniDio.kolicina * func.coalesce(KvarRezervniDio.jedinicna_cijena, 0)), 0)
    ).join(Kvar, KvarRezervniDio.kvar_id == Kvar.id).filter(
        Kvar.datum_prijave >= month_start
    ).scalar() or 0

    broj_radnika = db.query(func.count(Korisnik.id)).filter(Korisnik.aktivan == True).scalar() or 0
    otvoreni_records = db.query(Kvar).filter(Kvar.status.in_(OPEN_STATUSES)).all()
    sla_ratios = [k.udio_roka_u(now) for k in otvoreni_records]
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
        func.sum(KvarRezervniDio.kolicina).label("kolicina"),
        func.sum(KvarRezervniDio.kolicina * func.coalesce(KvarRezervniDio.jedinicna_cijena, 0)).label("trosak"),
    ).join(KvarRezervniDio, RezervniDio.id == KvarRezervniDio.rezervni_dio_id).outerjoin(
        Dobavljac, RezervniDio.dobavljac_id == Dobavljac.id
    ).group_by(
        RezervniDio.id, RezervniDio.naziv, RezervniDio.sifra, Dobavljac.naziv
    ).order_by(func.sum(KvarRezervniDio.kolicina).desc()).limit(10).all()

    items = []
    for r in result:
        items.append(SparePartUsageSummary(
            naziv=r.naziv,
            sifra=r.sifra,
            dobavljac=r.dobavljac,
            kolicina=float(r.kolicina or 0),
            trosak=float(r.trosak or 0),
        ))
    return items
