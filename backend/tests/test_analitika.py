"""Analytics figures checked against values worked out by hand."""
from datetime import datetime, timedelta, timezone

from app.database import SessionLocal
from app.models import Kvar, PrioritetEnum, StatusKvaraEnum
from app.routers.dashboard import _summary
from app.timeutil import utcnow
from tests.test_kvarovi import report


def at(day, hour, minute=0):
    return datetime(2001, 3, day, hour, minute, tzinfo=timezone.utc)


def set_fault(kvar_id, **values):
    db = SessionLocal()
    try:
        kvar = db.get(Kvar, kvar_id)
        for field, value in values.items():
            setattr(kvar, field, value)
        db.commit()
    finally:
        db.close()


def test_period_summary_matches_a_hand_calculation(client, make_user, machine):
    _, worker = make_user()
    ids = [report(client, worker, machine)["id"] for _ in range(3)]
    # Urgent (2 h window): reported 10:00, taken 10:30, resolved 11:30 → 90 min, on time, 60 min downtime, 100 €.
    set_fault(ids[0], prioritet=PrioritetEnum.hitno, status=StatusKvaraEnum.rijeseno, datum_prijave=at(2, 10),
              datum_pocetka=at(2, 10, 30), datum_rjesavanja=at(2, 11, 30), trajanje_min=60, troskovi=100)
    # Normal (8 h window): reported 08:00, taken 09:00, resolved 20:00 → 720 min, late, no downtime recorded.
    set_fault(ids[1], prioritet=PrioritetEnum.normalno, status=StatusKvaraEnum.rijeseno, datum_prijave=at(5, 8),
              datum_pocetka=at(5, 9), datum_rjesavanja=at(5, 20), trajanje_min=0, troskovi=0)
    # Low, still open and untaken.
    set_fault(ids[2], prioritet=PrioritetEnum.nisko, datum_prijave=at(10, 8))

    db = SessionLocal()
    try:
        summary = _summary(db, at(1, 0), at(31, 0))
    finally:
        db.close()
    assert summary.prijavljeno == 3
    assert summary.rijeseno == 2
    assert summary.vrijeme_do_rjesenja_min == 405.0  # (90 + 720) / 2
    assert summary.vrijeme_do_preuzimanja_min == 45.0  # (30 + 60) / 2
    assert summary.vrijeme_popravka_min == 360.0  # (60 + 660) / 2
    assert summary.sla_u_roku == 1 and summary.sla_postotak == 50.0
    assert summary.zastoj_min == 60 and summary.zastoj_evidentiran == 1
    assert summary.trosak_rada == 100.0


def test_empty_period_has_no_averages_rather_than_zeros(client):
    db = SessionLocal()
    try:
        summary = _summary(db, datetime(1990, 1, 1, tzinfo=timezone.utc), datetime(1990, 2, 1, tzinfo=timezone.utc))
    finally:
        db.close()
    assert summary.rijeseno == 0
    assert summary.vrijeme_do_rjesenja_min is None and summary.sla_postotak is None


def test_machines_recurring_parts_and_waiting_time(client, admin, make_user, machine):
    _, worker = make_user()
    component = client.post(f"/api/oprema/{machine['id']}/komponente", json={"naziv": "Ležaj"}, headers=admin).json()
    ids = [report(client, worker, machine, komponenta_id=component["id"])["id"] for _ in range(3)]
    now = utcnow()
    for hours_ago, kvar_id in zip((48, 24, 0), ids):
        set_fault(kvar_id, datum_prijave=now - timedelta(hours=hours_ago, minutes=1))

    client.put(f"/api/kvarovi/{ids[0]}", json={"status": "U rješavanju"}, headers=admin)
    client.put(f"/api/kvarovi/{ids[0]}", json={"status": "Na čekanju", "razlog_cekanja": "vanjski_servis"}, headers=admin)
    client.put(f"/api/kvarovi/{ids[0]}", json={"status": "U rješavanju"}, headers=admin)
    client.put(f"/api/kvarovi/{ids[1]}", json={"status": "U rješavanju"}, headers=admin)
    client.put(f"/api/kvarovi/{ids[1]}", json={"status": "Na čekanju", "razlog_cekanja": "vanjski_servis"}, headers=admin)

    response = client.get("/api/dashboard/analitika?period=30d", headers=admin)
    assert response.status_code == 200, response.text
    data = response.json()

    row = next(m for m in data["masine"] if m["oprema_id"] == machine["id"])
    assert row["kvarovi"] == 3
    assert row["mtbf_sati"] == 24.0  # reports 48 h, 24 h and 0 h ago

    recurring = next(r for r in data["ponavljanja"] if r["oprema_id"] == machine["id"])
    assert recurring["komponenta"] == "Ležaj" and recurring["kvarovi"] == 3

    waiting = next(w for w in data["cekanje"] if w["razlog"] == "vanjski_servis")
    assert waiting["broj"] >= 1 and waiting["trenutno"] >= 1

    assert {p["prioritet"] for p in data["po_prioritetu"]} == {"Hitno", "Normalno", "Nisko"}
    assert set(data["prethodno"]) == set(data["sazetak"])


def test_analytics_rejects_unknown_periods_and_workers(client, admin, make_user):
    _, worker = make_user()
    assert client.get("/api/dashboard/analitika?period=zauvijek", headers=admin).status_code == 422
    assert client.get("/api/dashboard/analitika", headers=worker).status_code == 403
