"""Regression tests for the 2026-10-29 improvement pass (docs/IMPROVEMENT_LOG.md):
data a worker must not see, and fault-record invariants the API must keep."""
from datetime import timedelta

from app.timeutil import utcnow
from tests.test_kvarovi import report
from tests.test_prilozi import photo, upload


def _part(client, admin, name="Remen A-42", price="9.90"):
    response = client.post("/api/rezervni-dijelovi", json={"naziv": name, "cijena": price}, headers=admin)
    assert response.status_code == 201, response.text
    return response.json()


def _resolve(client, admin, kvar_id, **extra):
    response = client.put(
        f"/api/kvarovi/{kvar_id}",
        json={"status": "Riješeno", "sto_je_uradjeno": "Zamijenjen remen", "troskovi": "80", **extra},
        headers=admin,
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_workers_never_receive_machine_repair_costs(client, admin, make_user, machine):
    _, worker = make_user()
    kvar = report(client, worker, machine)
    _resolve(client, admin, kvar["id"])

    listed = next(m for m in client.get("/api/oprema", headers=worker).json() if m["id"] == machine["id"])
    single = client.get(f"/api/oprema/{machine['id']}", headers=worker).json()
    assert listed["ukupni_troskovi"] is None and single["ukupni_troskovi"] is None

    # Leads still see them.
    lead_view = client.get(f"/api/oprema/{machine['id']}", headers=admin).json()
    assert lead_view["ukupni_troskovi"] == 80


def test_worker_timeline_hides_changes_to_costs_material_and_parts(client, admin, make_user, machine):
    _, worker = make_user()
    kvar = report(client, worker, machine)
    part = _part(client, admin)
    saved = client.put(
        f"/api/kvarovi/{kvar['id']}",
        json={"troskovi": "45", "materijal": "Remen", "utroseni_dijelovi": [{"rezervni_dio_id": part["id"], "kolicina": "1"}]},
        headers=admin,
    )
    assert saved.status_code == 200, saved.text
    # Work done is public: a change that includes it stays visible to the reporter.
    assert client.put(f"/api/kvarovi/{kvar['id']}", json={"sto_je_uradjeno": "Pregledano"}, headers=admin).status_code == 200

    worker_events = client.get(f"/api/kvarovi/{kvar['id']}/dogadjaji", headers=worker).json()
    assert "parts" not in {e["tip"] for e in worker_events}
    worker_fields = [e["podaci"]["fields"] for e in worker_events if e["tip"] == "details"]
    assert worker_fields == [["sto_je_uradjeno"]]

    lead_types = [e["tip"] for e in client.get(f"/api/kvarovi/{kvar['id']}/dogadjaji", headers=admin).json()]
    assert "parts" in lead_types and lead_types.count("details") == 2


def test_a_resolved_fault_cannot_lose_its_work_done(client, admin, make_user, machine):
    _, worker = make_user()
    kvar = report(client, worker, machine)
    _resolve(client, admin, kvar["id"])
    cleared = client.put(f"/api/kvarovi/{kvar['id']}", json={"sto_je_uradjeno": "   "}, headers=admin)
    assert cleared.status_code == 400
    assert client.get(f"/api/kvarovi/{kvar['id']}", headers=admin).json()["sto_je_uradjeno"] == "Zamijenjen remen"


def test_lifecycle_dates_cannot_contradict_the_status_or_the_clock(client, admin, make_user, machine):
    _, worker = make_user()
    kvar = report(client, worker, machine)
    url = f"/api/kvarovi/{kvar['id']}"
    future = (utcnow() + timedelta(days=2)).isoformat()
    before_report = (utcnow() - timedelta(days=30)).isoformat()

    # An open fault cannot carry a resolution date.
    assert client.put(url, json={"datum_rjesavanja": utcnow().isoformat()}, headers=admin).status_code == 400
    # Dates are never in the future nor before the report.
    assert client.put(url, json={"datum_pocetka": future}, headers=admin).status_code == 400
    assert client.put(url, json={"datum_pocetka": before_report}, headers=admin).status_code == 400
    assert client.get(url, headers=admin).json()["datum_rjesavanja"] is None

    # A correction that fits the record is still accepted.
    started_at = utcnow().isoformat()
    corrected = client.put(url, json={"status": "U rješavanju", "datum_pocetka": started_at}, headers=admin)
    assert corrected.status_code == 200, corrected.text
    # Resolution before the report (and so before the start) is refused.
    refused = client.put(url, json={"status": "Riješeno", "sto_je_uradjeno": "x", "datum_rjesavanja": before_report}, headers=admin)
    assert refused.status_code == 400
    assert client.get(url, headers=admin).json()["status"] == "U rješavanju"


def test_worker_adds_photos_only_while_the_fault_is_open(client, admin, make_user, machine):
    _, worker = make_user()
    kvar = report(client, worker, machine)
    assert upload(client, worker, kvar["id"], photo(size=(400, 300))).status_code == 201
    _resolve(client, admin, kvar["id"])
    assert upload(client, worker, kvar["id"], photo(size=(400, 300))).status_code == 403
    # Leads may still document a resolved fault.
    assert upload(client, admin, kvar["id"], photo(size=(400, 300))).status_code == 201


def test_parts_list_can_be_edited_when_it_holds_a_part_since_deactivated(client, admin, make_user, machine):
    _, worker = make_user()
    kvar = report(client, worker, machine)
    old_part = _part(client, admin, "Stari ležaj")
    new_part = _part(client, admin, "Novi ležaj")
    url = f"/api/kvarovi/{kvar['id']}"
    assert client.put(url, json={"utroseni_dijelovi": [{"rezervni_dio_id": old_part["id"], "kolicina": "1"}]}, headers=admin).status_code == 200
    assert client.delete(f"/api/rezervni-dijelovi/{old_part['id']}", headers=admin).status_code == 204

    both = [{"rezervni_dio_id": old_part["id"], "kolicina": "1"}, {"rezervni_dio_id": new_part["id"], "kolicina": "2"}]
    saved = client.put(url, json={"utroseni_dijelovi": both}, headers=admin)
    assert saved.status_code == 200, saved.text
    assert {u["rezervni_dio_id"] for u in saved.json()["utroseni_dijelovi"]} == {old_part["id"], new_part["id"]}

    # A deactivated part that was not already on this fault still cannot be added.
    other = report(client, worker, machine)
    refused = client.put(f"/api/kvarovi/{other['id']}", json={"utroseni_dijelovi": [{"rezervni_dio_id": old_part["id"], "kolicina": "1"}]}, headers=admin)
    assert refused.status_code == 404


def test_manual_push_accepts_only_in_app_links(client, admin):
    response = client.post("/api/notifikacije/posalji", json={"title": "x", "body": "y", "url": "https://example.com/"}, headers=admin)
    assert response.status_code == 422
    response = client.post("/api/notifikacije/posalji", json={"title": "x", "body": "y", "url": "//example.com/"}, headers=admin)
    assert response.status_code == 422
