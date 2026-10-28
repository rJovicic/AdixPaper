"""Web Push: the server sends it when an event happens, to the right people only."""
import json

import pytest
import pywebpush

from app.config import settings
from app.database import SessionLocal
from app.models import PushPretplata

from conftest import unique


class FakeResponse:
    def __init__(self, status_code):
        self.status_code = status_code


@pytest.fixture()
def pushes(monkeypatch):
    """Captures webpush calls instead of contacting a push service; endpoints in `gone` answer 410."""
    sent = []
    gone = set()

    def fake_webpush(subscription_info, data, vapid_private_key, vapid_claims):
        if subscription_info["endpoint"] in gone:
            raise pywebpush.WebPushException("gone", response=FakeResponse(410))
        sent.append((subscription_info["endpoint"], json.loads(data)))

    monkeypatch.setattr(pywebpush, "webpush", fake_webpush)
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "test-private-key")
    return sent, gone


def subscribe(client, headers, name):
    endpoint = f"https://push.example.invalid/{unique(name)}"
    response = client.post("/api/notifikacije/pretplata", json={"endpoint": endpoint, "p256dh": "k", "auth": "a"}, headers=headers)
    assert response.status_code == 201, response.text
    return endpoint


def test_a_new_report_is_pushed_to_leads_and_admins_only_with_a_link_and_no_description(client, admin, make_user, machine, pushes):
    sent, _ = pushes
    lead, lead_headers = make_user(rola="voditelj")
    worker, worker_headers = make_user()
    _, bystander_headers = make_user()
    admin_endpoint = subscribe(client, admin, "admin")
    lead_endpoint = subscribe(client, lead_headers, "lead")
    bystander_endpoint = subscribe(client, bystander_headers, "worker")

    created = client.post("/api/kvarovi", json={"oprema_id": machine["id"], "naslov": "Pukla traka", "opis": "Tajni detalji", "prioritet": "Hitno"}, headers=worker_headers)
    assert created.status_code == 201
    fault_id = created.json()["id"]

    to_this_fault = [(endpoint, data) for endpoint, data in sent if data["url"] == f"/admin/kvarovi/{fault_id}"]
    endpoints = {endpoint for endpoint, _ in to_this_fault}
    assert admin_endpoint in endpoints and lead_endpoint in endpoints
    assert bystander_endpoint not in endpoints
    for _, data in to_this_fault:
        assert data["tag"] == f"kvar-{fault_id}-novi"
        assert "Pukla traka" in data["body"] and "Tajni detalji" not in json.dumps(data)


def test_status_changes_are_pushed_to_the_reporter_only(client, admin, make_user, machine, pushes):
    sent, _ = pushes
    worker, worker_headers = make_user()
    _, other_headers = make_user()
    mine = subscribe(client, worker_headers, "reporter")
    other = subscribe(client, other_headers, "other")
    fault = client.post("/api/kvarovi", json={"oprema_id": machine["id"], "naslov": "Buka", "prioritet": "Normalno"}, headers=worker_headers).json()
    sent.clear()

    saved = client.put(f"/api/kvarovi/{fault['id']}", json={"status": "U rješavanju", "verzija": fault["verzija"]}, headers=admin)
    assert saved.status_code == 200
    assert [endpoint for endpoint, _ in sent] == [mine]
    assert sent[0][1]["url"] == f"/radnik/kvar/{fault['id']}"
    assert other not in [endpoint for endpoint, _ in sent]


def test_an_expired_subscription_is_removed(client, admin, make_user, machine, pushes):
    sent, gone = pushes
    endpoint = subscribe(client, admin, "expired")
    gone.add(endpoint)
    _, worker_headers = make_user()
    client.post("/api/kvarovi", json={"oprema_id": machine["id"], "naslov": "Kvar", "prioritet": "Nisko"}, headers=worker_headers)
    db = SessionLocal()
    try:
        assert db.query(PushPretplata).filter(PushPretplata.endpoint == endpoint).count() == 0
    finally:
        db.close()


def test_unsubscribing_stops_pushes(client, admin, make_user, machine, pushes):
    sent, _ = pushes
    _, lead_headers = make_user(rola="voditelj")
    endpoint = subscribe(client, lead_headers, "leaving")
    removed = client.request("DELETE", "/api/notifikacije/pretplata", json={"endpoint": endpoint, "p256dh": "k", "auth": "a"}, headers=lead_headers)
    assert removed.status_code == 200
    _, worker_headers = make_user()
    client.post("/api/kvarovi", json={"oprema_id": machine["id"], "naslov": "Kvar", "prioritet": "Nisko"}, headers=worker_headers)
    assert endpoint not in [e for e, _ in sent]


def test_without_vapid_keys_nothing_is_sent(client, make_user, machine, pushes, monkeypatch):
    sent, _ = pushes
    monkeypatch.setattr(settings, "VAPID_PRIVATE_KEY", "")
    _, worker_headers = make_user()
    created = client.post("/api/kvarovi", json={"oprema_id": machine["id"], "naslov": "Kvar", "prioritet": "Nisko"}, headers=worker_headers)
    assert created.status_code == 201
    assert sent == []
