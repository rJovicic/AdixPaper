"""Test configuration.

Set TEST_DATABASE_URL to run against PostgreSQL (recommended, matches production);
otherwise a temporary SQLite database is used. The schema is rebuilt per session.
"""
import os
import tempfile
from pathlib import Path

import pytest

_tmp = Path(tempfile.mkdtemp(prefix="adix-test-"))
_static = _tmp / "static"
(_static / "assets").mkdir(parents=True)
(_static / "index.html").write_text("<!doctype html><title>AdixPaper</title>", encoding="utf-8")
(_static / "assets" / "app-123.js").write_text("console.log(1)", encoding="utf-8")
(_tmp / "secret.txt").write_text("outside the dist folder", encoding="utf-8")

os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{_tmp / 'test.db'}"
os.environ["SECRET_KEY"] = "test-secret-key-that-is-long-enough-for-hs256"
os.environ["ADMIN_USERNAME"] = "admin"
os.environ["ADMIN_PASSWORD"] = "admin-pass-123"
os.environ["AUTO_SEED_SPARE_PARTS"] = "false"
os.environ["FRONTEND_DIST"] = str(_static)
os.environ.pop("RAILWAY_ENVIRONMENT_NAME", None)

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

ADMIN = ("admin", "admin-pass-123")


@pytest.fixture(scope="session")
def client():
    Base.metadata.drop_all(bind=engine)
    with TestClient(app) as test_client:
        yield test_client
    Base.metadata.drop_all(bind=engine)


def login(client, username, password):
    response = client.post("/api/auth/login", data={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture(scope="session")
def admin(client):
    return login(client, *ADMIN)


_counter = {"n": 0}


def unique(prefix):
    _counter["n"] += 1
    return f"{prefix}{_counter['n']}"


@pytest.fixture()
def make_user(client, admin):
    def _make(rola="radnik", password="worker-pass-1", **extra):
        username = unique(rola)
        payload = {"username": username, "ime": "Test", "prezime": rola.title(), "password": password, "rola": rola, **extra}
        response = client.post("/api/korisnici", json=payload, headers=admin)
        assert response.status_code == 200, response.text
        return response.json(), login(client, username, password)
    return _make


@pytest.fixture()
def machine(client, admin):
    response = client.post("/api/oprema", json={"naziv": unique("Stroj "), "tip": "Rezačica", "tvrtka": "Cupup d.o.o"}, headers=admin)
    assert response.status_code == 200, response.text
    return response.json()
