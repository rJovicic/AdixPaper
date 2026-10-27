"""Waiting reasons, stale-save conflicts, attention reasons, the overview and the paged fault list."""
from datetime import timedelta

from app.database import SessionLocal
from app.models import Kvar
from app.timeutil import utcnow

from tests.test_kvarovi import report


def put(client, headers, kvar_id, **body):
    return client.put(f"/api/kvarovi/{kvar_id}", json=body, headers=headers)


def shift_reported(kvar_id, hours):
    """Pretend the fault was reported `hours` ago."""
    db = SessionLocal()
    try:
        kvar = db.get(Kvar, kvar_id)
        kvar.datum_prijave = utcnow() - timedelta(hours=hours)
        db.commit()
    finally:
        db.close()


def test_putting_a_fault_on_hold_requires_a_reason_and_records_it(client, admin, make_user, machine):
    _, worker = make_user()
    kvar = report(client, worker, machine)
    put(client, admin, kvar["id"], status="U rješavanju")

    missing = put(client, admin, kvar["id"], status="Na čekanju")
    assert missing.status_code == 400
    bad = put(client, admin, kvar["id"], status="Na čekanju", razlog_cekanja="kava")
    assert bad.status_code == 422

    held = put(client, admin, kvar["id"], status="Na čekanju", razlog_cekanja="dijelovi").json()
    assert held["razlog_cekanja"] == "dijelovi" and held["cekanje_od"]
    # The worker sees why their fault waits: the reason is not internal.
    assert client.get(f"/api/kvarovi/{kvar['id']}", headers=worker).json()["razlog_cekanja"] == "dijelovi"

    changed = put(client, admin, kvar["id"], razlog_cekanja="vanjski_servis").json()
    assert changed["razlog_cekanja"] == "vanjski_servis"

    resumed = put(client, admin, kvar["id"], status="U rješavanju").json()
    assert resumed["razlog_cekanja"] is None and resumed["cekanje_od"] is None

    events = client.get(f"/api/kvarovi/{kvar['id']}/dogadjaji", headers=admin).json()
    hold = [e for e in events if e["tip"] == "status" and e["podaci"]["new"] == "Na čekanju"][0]
    assert hold["podaci"]["razlog"] == "dijelovi"
    assert any(e["tip"] == "waiting" for e in events)
    leave = [e for e in events if e["tip"] == "status" and e["podaci"]["old"] == "Na čekanju"][0]
    assert leave["podaci"]["cekanje_razlog"] == "vanjski_servis"
    assert leave["podaci"]["cekanje_min"] >= 0


def test_a_save_based_on_an_old_version_is_rejected_not_overwritten(client, admin, make_user, machine):
    _, worker = make_user()
    _, lead = make_user(rola="voditelj")
    kvar = report(client, worker, machine)
    version = kvar["verzija"]

    first = put(client, lead, kvar["id"], sto_je_uradjeno="Zamijenjen nož", verzija=version)
    assert first.status_code == 200 and first.json()["verzija"] == version + 1

    stale = put(client, admin, kvar["id"], sto_je_uradjeno="Nešto drugo", verzija=version)
    assert stale.status_code == 409
    assert client.get(f"/api/kvarovi/{kvar['id']}", headers=admin).json()["sto_je_uradjeno"] == "Zamijenjen nož"

    # Without a version (older clients, scripts) the save still goes through.
    assert put(client, admin, kvar["id"], troskovi="10").status_code == 200


def test_attention_reasons_say_why_a_fault_needs_action(client, admin, make_user, machine):
    _, worker = make_user()
    urgent = report(client, worker, machine, prioritet="Hitno")
    assert client.get(f"/api/kvarovi/{urgent['id']}", headers=admin).json()["razlozi_paznje"] == ["hitno", "nedodijeljen"]

    shift_reported(urgent["id"], 3)  # urgent window is 2 h
    late = client.get(f"/api/kvarovi/{urgent['id']}", headers=admin).json()
    assert late["razlozi_paznje"][0] == "kasni"

    low = report(client, worker, machine, prioritet="Nisko")
    shift_reported(low["id"], 40)  # 8 h of 48 h left: due soon
    put(client, admin, low["id"], status="U rješavanju")
    assert client.get(f"/api/kvarovi/{low['id']}", headers=admin).json()["razlozi_paznje"] == ["uskoro"]

    put(client, admin, low["id"], status="Na čekanju", razlog_cekanja="odobrenje")
    db = SessionLocal()
    try:
        db.get(Kvar, low["id"]).cekanje_od = utcnow() - timedelta(hours=30)
        db.commit()
    finally:
        db.close()
    assert "ceka_dugo" in client.get(f"/api/kvarovi/{low['id']}", headers=admin).json()["razlozi_paznje"]

    put(client, admin, low["id"], status="Riješeno", sto_je_uradjeno="Odobreno i zamijenjeno")
    assert client.get(f"/api/kvarovi/{low['id']}", headers=admin).json()["razlozi_paznje"] == []


def test_overview_counts_match_the_lists_they_link_to(client, admin, make_user, machine):
    _, worker = make_user()
    lead_user, lead = make_user(rola="voditelj")
    a = report(client, worker, machine, prioritet="Hitno")
    b = report(client, worker, machine, prioritet="Normalno")
    put(client, lead, b["id"], status="U rješavanju")
    put(client, lead, b["id"], status="Na čekanju", razlog_cekanja="dijelovi")
    shift_reported(a["id"], 5)

    overview = client.get("/api/dashboard/pregled?period=7d", headers=admin)
    assert overview.status_code == 200, overview.text
    kpi = overview.json()["kpi"]

    def count(query):
        response = client.get(f"/api/kvarovi?{query}&limit=1", headers=admin)
        return int(response.headers["X-Total-Count"])

    assert kpi["otvoreni"] == count("status=otvoreni")
    assert kpi["hitni"] == count("status=otvoreni&prioritet=Hitno")
    assert kpi["kasni"] == count("sla=kasni")
    assert kpi["nedodijeljeni"] == count("status=otvoreni&preuzeo=nitko")
    assert kpi["u_rjesavanju"] == count("status=U rješavanju")
    assert kpi["na_cekanju"] == count("status=Na čekanju")
    assert kpi["ceka_dijelove"] == count("cekanje=dijelovi")
    assert kpi["kasni"] >= 1 and kpi["ceka_dijelove"] >= 1
    assert kpi["rijeseni_u_periodu"] == count("rijeseno=7d")

    load = {row["korisnik"]["id"]: row for row in overview.json()["opterecenje"]}
    assert load[lead_user["id"]]["na_cekanju"] == 1
    assert load[lead_user["id"]]["otvoreni"] == count(f"status=otvoreni&preuzeo={lead_user['id']}")

    activity = overview.json()["aktivnosti"]
    assert activity and activity[0]["kvar_id"] in (a["id"], b["id"])

    assert client.get("/api/dashboard/pregled?period=zauvijek", headers=admin).status_code == 422


def test_overview_is_for_leads_only(client, make_user):
    _, worker = make_user()
    assert client.get("/api/dashboard/pregled", headers=worker).status_code == 403


def test_fault_list_pages_searches_and_filters_on_the_server(client, admin, make_user, machine):
    _, worker = make_user()
    ids = [report(client, worker, machine, naslov=f"Paging kvar {n}", prioritet="Nisko")["id"] for n in range(5)]

    first = client.get("/api/kvarovi?q=paging kvar&limit=2", headers=admin)
    assert first.status_code == 200
    assert int(first.headers["X-Total-Count"]) == 5
    assert [k["id"] for k in first.json()] == sorted(ids, reverse=True)[:2]
    rest = client.get("/api/kvarovi?q=paging kvar&limit=2&offset=4", headers=admin).json()
    assert [k["id"] for k in rest] == [min(ids)]

    by_number = client.get(f"/api/kvarovi?q=%23{ids[0]}", headers=admin).json()
    assert [k["id"] for k in by_number] == [ids[0]]
    by_machine = client.get(f"/api/kvarovi?q={machine['naziv'].lower()}", headers=admin).json()
    assert {k["id"] for k in by_machine} >= set(ids)

    oldest = client.get("/api/kvarovi?q=paging&sort=staro&limit=1", headers=admin).json()
    assert oldest[0]["id"] == min(ids)

    for bad in ("sort=x", "preuzeo=netko", "cekanje=kava", "sla=jucer"):
        assert client.get(f"/api/kvarovi?{bad}", headers=admin).status_code == 422, bad

    # Workers still see only their own faults, paging or not.
    _, other = make_user()
    assert client.get("/api/kvarovi?q=paging&limit=5", headers=other).json() == []


def test_open_faults_on_a_machine_show_no_people_or_internals(client, admin, make_user, machine):
    _, reporter = make_user()
    _, colleague = make_user()
    kvar = report(client, reporter, machine)
    put(client, admin, kvar["id"], napomene_voditelja="Interno")

    seen = client.get(f"/api/kvarovi/na-masini/{machine['id']}", headers=colleague)
    assert seen.status_code == 200
    row = next(item for item in seen.json() if item["id"] == kvar["id"])
    assert set(row) == {"id", "naslov", "status", "datum_prijave", "komponenta"}

    put(client, admin, kvar["id"], status="Riješeno", sto_je_uradjeno="Gotovo")
    assert all(item["id"] != kvar["id"] for item in client.get(f"/api/kvarovi/na-masini/{machine['id']}", headers=colleague).json())


def test_worker_sees_when_their_fault_changes(client, admin, make_user, machine):
    _, worker = make_user()
    kvar = report(client, worker, machine)
    assert kvar["azurirano"] is None
    put(client, admin, kvar["id"], troskovi="5")  # internal change: no badge for the worker
    assert client.get(f"/api/kvarovi/{kvar['id']}", headers=worker).json()["azurirano"] is None
    put(client, admin, kvar["id"], status="U rješavanju")
    first = client.get("/api/kvarovi", headers=worker).json()[0]["azurirano"]
    assert first
    client.post(f"/api/kvarovi/{kvar['id']}/komentari", json={"tekst": "Interno", "interno": True}, headers=admin)
    assert client.get("/api/kvarovi", headers=worker).json()[0]["azurirano"] == first


def test_reporter_is_notified_of_changes_they_can_see(client, admin, make_user, machine, monkeypatch):
    from app.routers import kvarovi

    sent = []
    monkeypatch.setattr(kvarovi, "_send_push_notifications", lambda title, body, url="/", user_ids=None: sent.append((body, url, user_ids)))
    worker_user, worker = make_user()
    kvar = report(client, worker, machine)
    sent.clear()  # the new-fault push to leads

    put(client, admin, kvar["id"], troskovi="5")
    client.post(f"/api/kvarovi/{kvar['id']}/komentari", json={"tekst": "Interno", "interno": True}, headers=admin)
    assert sent == []  # nothing the worker can see changed

    put(client, admin, kvar["id"], status="U rješavanju")
    client.post(f"/api/kvarovi/{kvar['id']}/komentari", json={"tekst": "Stiže dio", "interno": False}, headers=admin)
    assert [(body, user_ids) for body, _, user_ids in sent] == [
        ("Status: U rješavanju", [worker_user["id"]]),
        ("Komentar: Stiže dio", [worker_user["id"]]),
    ]
    assert sent[0][1] == f"/radnik/kvar/{kvar['id']}"

    # The worker's own comment does not notify the worker.
    client.post(f"/api/kvarovi/{kvar['id']}/komentari", json={"tekst": "Hvala"}, headers=worker)
    assert len(sent) == 2
