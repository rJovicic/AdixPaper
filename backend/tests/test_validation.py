"""Bad input must be answered with a 4xx the UI can show, never a 500."""
import pytest


@pytest.mark.parametrize("payload", [
    # "tip" became optional on 2026-10-30 (a production line has no single type); a blank name is still refused.
    {"naziv": None}, {"naziv": "   "}, {"status": None}, {"proizvodac": "p" * 300}, {"serijski_broj": "s" * 300},
    {"inventurni_broj": "i" * 300}, {"inventurni_broj": "?!"},
])
def test_machine_update_rejects_empty_required_and_oversized_values(client, admin, machine, payload):
    assert client.put(f"/api/oprema/{machine['id']}", json=payload, headers=admin).status_code == 422


@pytest.mark.parametrize("payload", [{"ime": None}, {"prezime": "  "}, {"rola": None}, {"aktivan": None}])
def test_user_update_rejects_empty_required_values(client, admin, make_user, payload):
    user, _ = make_user()
    assert client.put(f"/api/korisnici/{user['id']}", json=payload, headers=admin).status_code == 422


@pytest.mark.parametrize("payload", [{"naziv": None}, {"jedinica": None}, {"aktivan": None}])
def test_spare_part_update_rejects_empty_required_values(client, admin, payload):
    part = client.post("/api/rezervni-dijelovi", json={"naziv": "Remen"}, headers=admin).json()
    assert client.put(f"/api/rezervni-dijelovi/{part['id']}", json=payload, headers=admin).status_code == 422


def test_component_update_rejects_empty_required_values(client, admin, machine):
    component = client.post(f"/api/oprema/{machine['id']}/komponente", json={"naziv": "Nož"}, headers=admin).json()
    for payload in ({"naziv": None}, {"aktivna": None}):
        assert client.put(f"/api/oprema/komponente/{component['id']}", json=payload, headers=admin).status_code == 422


def test_optional_fields_can_still_be_cleared(client, admin, machine):
    client.put(f"/api/oprema/{machine['id']}", json={"lokacija": "Hala A"}, headers=admin)
    cleared = client.put(f"/api/oprema/{machine['id']}", json={"lokacija": ""}, headers=admin)
    assert cleared.status_code == 200 and cleared.json()["lokacija"] is None


def test_report_ignores_client_supplied_photo_url(client, make_user, machine):
    _, worker = make_user()
    response = client.post("/api/kvarovi", json={"oprema_id": machine["id"], "naslov": "x", "foto_url": "a" * 600}, headers=worker)
    assert response.status_code == 201
    assert response.json()["foto_url"] is None
