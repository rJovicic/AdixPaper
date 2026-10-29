"""The 2 h / 8 h / 48 h windows run from the report to the FIRST RESPONSE (owner, 2026-10-29):
the first time a lead or admin moves the fault out of "Novo". Resolution time is separate."""
from datetime import datetime, timedelta, timezone

from app.database import SessionLocal
from app.models import Kvar, PrioritetEnum, StatusKvaraEnum
from app.routers.dashboard import _summary
from app.timeutil import utcnow
from tests.test_analitika import set_fault
from tests.test_kvarovi import report


def at(day, hour, minute=0):
    # Its own month in the shared test database (test_analitika uses March 2001).
    return datetime(2002, 5, day, hour, minute, tzinfo=timezone.utc)


def _put(client, headers, kvar_id, **data):
    response = client.put(f"/api/kvarovi/{kvar_id}", json=data, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_taking_a_fault_records_its_first_response_once(client, admin, make_user, machine):
    _, worker = make_user()
    kvar = report(client, worker, machine)
    assert kvar["datum_odziva"] is None and kvar["odziv_u_roku"] is None

    taken = _put(client, admin, kvar["id"], status="U rješavanju")
    first = taken["datum_odziva"]
    assert first and taken["odziv_u_roku"] is True

    # Reopened to "Novo" and taken again: the first response stays the first one.
    _put(client, admin, kvar["id"], status="Riješeno", sto_je_uradjeno="Podešeno")
    reopened = _put(client, admin, kvar["id"], status="Novo")
    assert reopened["datum_odziva"] == first
    assert "kasni" not in reopened["razlozi_paznje"] and "uskoro" not in reopened["razlozi_paznje"]
    assert _put(client, admin, kvar["id"], status="U rješavanju")["datum_odziva"] == first

    # Workers see when someone first responded (it is progress, not an internal detail).
    assert client.get(f"/api/kvarovi/{kvar['id']}", headers=worker).json()["datum_odziva"] == first


def test_putting_on_hold_or_resolving_straight_from_new_is_a_response(client, admin, make_user, machine):
    _, worker = make_user()
    held = report(client, worker, machine)
    assert _put(client, admin, held["id"], status="Na čekanju", razlog_cekanja="dijelovi")["datum_odziva"]
    fixed = report(client, worker, machine)
    assert _put(client, admin, fixed["id"], status="Riješeno", sto_je_uradjeno="Odmah riješeno")["datum_odziva"]
    # Other edits (priority, notes, assignment) are not a response.
    edited = report(client, worker, machine)
    lead, _ = make_user("voditelj")
    after = _put(client, admin, edited["id"], prioritet="Nisko", napomene_voditelja="Pogledati", voditelj_id=lead["id"])
    assert after["datum_odziva"] is None


def test_only_faults_waiting_for_a_response_are_overdue(client, admin, make_user, machine):
    _, worker = make_user()
    waiting = report(client, worker, machine)  # urgent, 2 h window
    answered = report(client, worker, machine)
    three_hours_ago = utcnow() - timedelta(hours=3)
    _put(client, admin, answered["id"], status="U rješavanju")
    set_fault(waiting["id"], datum_prijave=three_hours_ago)
    set_fault(answered["id"], datum_prijave=three_hours_ago, datum_odziva=three_hours_ago + timedelta(minutes=30))

    w = client.get(f"/api/kvarovi/{waiting['id']}", headers=admin).json()
    a = client.get(f"/api/kvarovi/{answered['id']}", headers=admin).json()
    assert "kasni" in w["razlozi_paznje"]
    # Still open and past report + 2 h, but answered in 30 min: on time, not overdue.
    assert "kasni" not in a["razlozi_paznje"] and a["odziv_u_roku"] is True

    late_ids = {k["id"] for k in client.get(f"/api/kvarovi?sla=kasni&oprema_id={machine['id']}", headers=admin).json()}
    assert waiting["id"] in late_ids and answered["id"] not in late_ids
    ranked = [k["id"] for k in client.get(f"/api/kvarovi?status=otvoreni&sort=rizik&oprema_id={machine['id']}", headers=admin).json()]
    assert ranked.index(waiting["id"]) < ranked.index(answered["id"])


def test_on_time_share_is_about_first_response_not_resolution(client, make_user, machine):
    _, worker = make_user()
    ids = [report(client, worker, machine)["id"] for _ in range(4)]
    # Urgent: responded after 30 min, resolved after 10 h → response ON TIME (the old rule said late).
    set_fault(ids[0], prioritet=PrioritetEnum.hitno, status=StatusKvaraEnum.rijeseno, datum_prijave=at(2, 8),
              datum_odziva=at(2, 8, 30), datum_pocetka=at(2, 8, 30), datum_rjesavanja=at(2, 18), sto_je_uradjeno="x")
    # Normal: responded after 9 h → LATE, although resolved inside 10 h.
    set_fault(ids[1], prioritet=PrioritetEnum.normalno, status=StatusKvaraEnum.u_rjesavanju, datum_prijave=at(3, 8),
              datum_odziva=at(3, 17), datum_pocetka=at(3, 17))
    # Urgent, never answered, window long passed → LATE.
    set_fault(ids[2], prioritet=PrioritetEnum.hitno, datum_prijave=at(4, 8))
    # Low, left "Novo" before first responses were recorded (no datum_odziva): not judged.
    set_fault(ids[3], prioritet=PrioritetEnum.nisko, status=StatusKvaraEnum.u_rjesavanju, datum_prijave=at(5, 8))

    db = SessionLocal()
    try:
        summary = _summary(db, at(1, 0), at(31, 0))
        assert db.get(Kvar, ids[3]).odziv_u_roku is None
    finally:
        db.close()
    assert summary.sla_u_roku == 1 and summary.sla_ocijenjeno == 3
    assert summary.sla_postotak == 33.3
    assert summary.vrijeme_do_odziva_min == 285.0  # (30 + 540) / 2
    assert summary.vrijeme_do_rjesenja_min == 600.0  # resolution time stays its own metric


def test_exports_say_how_the_response_went(client, admin, make_user, machine):
    from io import BytesIO

    from openpyxl import load_workbook

    _, worker = make_user()
    kvar = report(client, worker, machine)
    _put(client, admin, kvar["id"], status="U rješavanju")
    response = client.get(f"/api/kvarovi/export.xlsx?oprema_id={machine['id']}", headers=admin)
    sheet = load_workbook(BytesIO(response.content)).active
    header = [cell.value for cell in sheet[1]]
    row = next(r for r in sheet.iter_rows(min_row=2, values_only=True) if r[0] == kvar["id"])
    assert row[header.index("Odziv")] == "Odziv u roku"
    assert row[header.index("Prvi odziv")] is not None
