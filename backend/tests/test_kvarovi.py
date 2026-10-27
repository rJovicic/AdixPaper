def report(client, headers, machine, **extra):
    payload = {"oprema_id": machine["id"], "naslov": "Nož ne reže", "prioritet": "Hitno", **extra}
    response = client.post("/api/kvarovi", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_worker_reports_and_sees_only_own_faults(client, make_user, machine):
    _, worker_a = make_user()
    _, worker_b = make_user()
    kvar = report(client, worker_a, machine)
    assert kvar["status"] == "Novo"

    own = client.get("/api/kvarovi", headers=worker_a).json()
    assert [k["id"] for k in own] == [kvar["id"]]
    assert client.get(f"/api/kvarovi/{kvar['id']}", headers=worker_b).status_code == 404
    assert all(k["id"] != kvar["id"] for k in client.get("/api/kvarovi", headers=worker_b).json())


def test_fault_title_is_required(client, make_user, machine):
    _, worker = make_user()
    response = client.post("/api/kvarovi", json={"oprema_id": machine["id"], "naslov": "   "}, headers=worker)
    assert response.status_code == 422


def test_worker_cannot_update_or_view_dashboard(client, make_user, machine):
    _, worker = make_user()
    kvar = report(client, worker, machine)
    assert client.put(f"/api/kvarovi/{kvar['id']}", json={"status": "Riješeno"}, headers=worker).status_code == 403
    assert client.get("/api/dashboard/stats", headers=worker).status_code == 403
    assert client.get("/api/kvarovi/export.xlsx", headers=worker).status_code == 403


def test_lifecycle_with_parts_and_reopen(client, admin, make_user, machine):
    _, worker = make_user()
    kvar = report(client, worker, machine)
    supplier = client.get("/api/rezervni-dijelovi/dobavljaci", headers=admin).json()[0]
    part = client.post("/api/rezervni-dijelovi", json={"naziv": "Ležaj 6204", "dobavljac_id": supplier["id"], "cijena": "12.50"}, headers=admin).json()

    started = client.put(f"/api/kvarovi/{kvar['id']}", json={"status": "U rješavanju"}, headers=admin).json()
    assert started["datum_pocetka"] and started["voditelj_id"]

    resolved = client.put(
        f"/api/kvarovi/{kvar['id']}",
        json={"status": "Riješeno", "sto_je_uradjeno": "Zamijenjen ležaj", "utroseni_dijelovi": [{"rezervni_dio_id": part["id"], "kolicina": "2"}]},
        headers=admin,
    ).json()
    assert resolved["datum_rjesavanja"]
    assert len(resolved["utroseni_dijelovi"]) == 1

    reopened = client.put(f"/api/kvarovi/{kvar['id']}", json={"status": "U rješavanju"}, headers=admin).json()
    assert reopened["datum_rjesavanja"] is None

    events = client.get(f"/api/kvarovi/{kvar['id']}/dogadjaji", headers=admin).json()
    assert {"created", "status", "parts", "details"} <= {e["tip"] for e in events}


def test_part_quantity_must_be_positive(client, admin, make_user, machine):
    _, worker = make_user()
    kvar = report(client, worker, machine)
    response = client.put(
        f"/api/kvarovi/{kvar['id']}", json={"utroseni_dijelovi": [{"rezervni_dio_id": 1, "kolicina": "0"}]}, headers=admin
    )
    assert response.status_code == 422


def test_internal_comments_are_hidden_from_worker(client, admin, make_user, machine):
    _, worker = make_user()
    kvar = report(client, worker, machine)
    assert client.post(f"/api/kvarovi/{kvar['id']}/komentari", json={"tekst": "Interno", "interno": True}, headers=admin).status_code == 201
    assert client.post(f"/api/kvarovi/{kvar['id']}/komentari", json={"tekst": "Dolazimo", "interno": False}, headers=admin).status_code == 201
    # A worker cannot mark their own comment internal.
    assert client.post(f"/api/kvarovi/{kvar['id']}/komentari", json={"tekst": "Hvala", "interno": True}, headers=worker).json()["interno"] is False

    texts = [e["opis"] for e in client.get(f"/api/kvarovi/{kvar['id']}/dogadjaji", headers=worker).json()]
    assert "Dolazimo" in texts and "Interno" not in texts


def test_new_fault_feed(client, admin, make_user, machine):
    _, worker = make_user()
    latest = client.get("/api/kvarovi/novi", headers=admin).json()
    since = latest[0]["id"] if latest else 0
    kvar = report(client, worker, machine)
    feed = client.get(f"/api/kvarovi/novi?since_id={since}", headers=admin).json()
    assert [k["id"] for k in feed] == [kvar["id"]]
    assert feed[0]["oprema"]["naziv"] == machine["naziv"]
    assert client.get("/api/kvarovi/novi", headers=worker).status_code == 403


def test_exports_and_dashboard(client, admin):
    for path in ("/api/kvarovi/export.xlsx", "/api/kvarovi/export.pdf", "/api/kvarovi/export-dijelovi.xlsx"):
        response = client.get(path, headers=admin)
        assert response.status_code == 200, path
        assert len(response.content) > 100
    for path in ("stats", "kvarovi-po-mjesecu", "top-oprema", "kvarovi-po-statusu", "kvarovi-po-prioritetu", "top-komponente", "utrosak-dijelova"):
        assert client.get(f"/api/dashboard/{path}", headers=admin).status_code == 200, path
    stats = client.get("/api/dashboard/stats", headers=admin).json()
    assert stats["kvarovi_danas"] >= 1
    assert stats["zastoj_ovaj_mjesec_min"] <= stats["ukupni_zastoj_min"]


def test_machine_with_faults_cannot_be_deleted(client, admin, make_user, machine):
    _, worker = make_user()
    report(client, worker, machine)
    assert client.delete(f"/api/oprema/{machine['id']}", headers=admin).status_code == 409

    empty = client.post("/api/oprema", json={"naziv": "Prazan stroj", "tip": "Test", "serijski_broj": ""}, headers=admin).json()
    other = client.post("/api/oprema", json={"naziv": "Drugi stroj", "tip": "Test", "serijski_broj": ""}, headers=admin)
    assert other.status_code == 200, "blank serial numbers must not collide"
    assert client.delete(f"/api/oprema/{empty['id']}", headers=admin).status_code == 200


def test_component_must_belong_to_machine(client, admin, make_user, machine):
    _, worker = make_user()
    other = client.post("/api/oprema", json={"naziv": "Treći stroj", "tip": "Test"}, headers=admin).json()
    comp = client.post(f"/api/oprema/{other['id']}/komponente", json={"naziv": "Senzor"}, headers=admin).json()
    response = client.post("/api/kvarovi", json={"oprema_id": machine["id"], "komponenta_id": comp["id"], "naslov": "X"}, headers=worker)
    assert response.status_code == 404


def test_resaving_unchanged_details_does_not_spam_the_timeline(client, admin, make_user, machine):
    _, worker = make_user()
    kvar = report(client, worker, machine)
    supplier = client.get("/api/rezervni-dijelovi/dobavljaci", headers=admin).json()[0]
    part = client.post("/api/rezervni-dijelovi", json={"naziv": "Remen", "dobavljac_id": supplier["id"]}, headers=admin).json()
    payload = {
        "sto_je_uradjeno": "Zategnut remen", "troskovi": 0, "trajanje_min": 30, "materijal": "", "napomene_voditelja": "",
        "utroseni_dijelovi": [{"rezervni_dio_id": part["id"], "kolicina": 1, "napomena": ""}],
    }
    assert client.put(f"/api/kvarovi/{kvar['id']}", json=payload, headers=admin).status_code == 200
    first = client.get(f"/api/kvarovi/{kvar['id']}/dogadjaji", headers=admin).json()
    # Same values again, plus taking the fault: only status and the automatic assignment are new.
    assert client.put(f"/api/kvarovi/{kvar['id']}", json={**payload, "status": "U rješavanju"}, headers=admin).status_code == 200
    second = client.get(f"/api/kvarovi/{kvar['id']}/dogadjaji", headers=admin).json()
    assert [e["tip"] for e in second[len(first):]] == ["status", "assignment"]
    assert len(client.get(f"/api/kvarovi/{kvar['id']}", headers=admin).json()["utroseni_dijelovi"]) == 1


def test_spare_part_without_supplier(client, admin, make_user, machine):
    created = client.post("/api/rezervni-dijelovi", json={"naziv": "Remen B-42", "sifra": "RB42"}, headers=admin)
    assert created.status_code == 201, created.text
    part = created.json()
    assert part["dobavljac_id"] is None

    _, worker = make_user()
    kvar = report(client, worker, machine)
    response = client.put(f"/api/kvarovi/{kvar['id']}", json={"utroseni_dijelovi": [{"rezervni_dio_id": part["id"], "kolicina": "3"}]}, headers=admin)
    assert response.status_code == 200, response.text

    usage = client.get("/api/dashboard/utrosak-dijelova", headers=admin).json()
    assert any(row["sifra"] == "RB42" and row["dobavljac"] is None for row in usage)
    assert client.get("/api/kvarovi/export-dijelovi.xlsx", headers=admin).status_code == 200


# The full form FaultDetail.jsx sent before it switched to changed-fields-only payloads.
STALE_FORM = {"prioritet": "Hitno", "voditelj_id": None, "komponenta_id": None, "sto_je_uradjeno": "", "materijal": "",
              "napomene_voditelja": "", "troskovi": 0, "trajanje_min": 0, "utroseni_dijelovi": []}


def test_taking_a_fault_assigns_the_lead_even_when_the_form_says_unassigned(client, make_user, machine):
    _, worker = make_user()
    lead, lead_h = make_user(rola="voditelj")
    kvar = report(client, worker, machine)
    taken = client.put(f"/api/kvarovi/{kvar['id']}", json={**STALE_FORM, "status": "U rješavanju"}, headers=lead_h).json()
    assert taken["status"] == "U rješavanju"
    assert taken["voditelj_id"] == lead["id"]
    assert taken["datum_pocetka"]


def test_taking_keeps_an_existing_assignee(client, make_user, machine):
    _, worker = make_user()
    first, _ = make_user(rola="voditelj")
    _, second_h = make_user(rola="voditelj")
    kvar = report(client, worker, machine)
    client.put(f"/api/kvarovi/{kvar['id']}", json={"voditelj_id": first["id"]}, headers=second_h)
    taken = client.put(f"/api/kvarovi/{kvar['id']}", json={"status": "U rješavanju"}, headers=second_h).json()
    assert taken["voditelj_id"] == first["id"]


def test_assignee_must_be_an_active_lead_or_admin(client, make_user, machine):
    _, worker = make_user()
    other_worker, _ = make_user()
    inactive_lead, _ = make_user(rola="voditelj")
    _, lead_h = make_user(rola="voditelj")
    kvar = report(client, worker, machine)
    from tests.conftest import ADMIN, login
    admin_h = login(client, *ADMIN)
    client.put(f"/api/korisnici/{inactive_lead['id']}", json={"aktivan": False}, headers=admin_h)
    for assignee in (999999, other_worker["id"], inactive_lead["id"]):
        response = client.put(f"/api/kvarovi/{kvar['id']}", json={"voditelj_id": assignee}, headers=lead_h)
        assert response.status_code == 400, (assignee, response.text)


def test_resolving_requires_work_done(client, make_user, machine):
    _, worker = make_user()
    _, lead_h = make_user(rola="voditelj")
    kvar = report(client, worker, machine)
    response = client.put(f"/api/kvarovi/{kvar['id']}", json={"status": "Riješeno"}, headers=lead_h)
    assert response.status_code == 400
    assert client.get(f"/api/kvarovi/{kvar['id']}", headers=lead_h).json()["status"] == "Novo"
    resolved = client.put(f"/api/kvarovi/{kvar['id']}", json={"status": "Riješeno", "sto_je_uradjeno": "Naoštren nož"}, headers=lead_h)
    assert resolved.status_code == 200 and resolved.json()["datum_rjesavanja"]


def test_only_admins_can_delete_a_fault(client, admin, make_user, machine):
    _, worker = make_user()
    _, lead_h = make_user(rola="voditelj")
    kvar = report(client, worker, machine)
    assert client.delete(f"/api/kvarovi/{kvar['id']}", headers=lead_h).status_code == 403
    assert client.delete(f"/api/kvarovi/{kvar['id']}", headers=admin).status_code == 204


def test_open_filter_and_invalid_filters(client, make_user, machine):
    _, worker = make_user()
    _, lead_h = make_user(rola="voditelj")
    open_fault = report(client, worker, machine)
    done = report(client, worker, machine)
    client.put(f"/api/kvarovi/{done['id']}", json={"status": "Riješeno", "sto_je_uradjeno": "x"}, headers=lead_h)
    ids = {k["id"] for k in client.get("/api/kvarovi?status=otvoreni", headers=lead_h).json()}
    assert open_fault["id"] in ids and done["id"] not in ids
    assert client.get("/api/kvarovi?status=nepostojeci", headers=lead_h).status_code == 422
    assert client.get("/api/oprema?status=nepostojeci", headers=lead_h).status_code == 422
