from datetime import datetime, timedelta, timezone

import jwt


def test_health_checks_database(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_spa_serves_index_for_client_routes(client):
    for path in ("/", "/login", "/admin/kvarovi/12", "/radnik"):
        response = client.get(path)
        assert response.status_code == 200
        assert "AdixPaper" in response.text
        assert response.headers["cache-control"] == "no-cache"


def test_spa_assets_are_immutable_and_missing_files_404(client):
    asset = client.get("/assets/app-123.js")
    assert asset.status_code == 200
    assert "immutable" in asset.headers["cache-control"]
    assert client.get("/assets/missing-999.js").status_code == 404


def test_unknown_api_route_is_json_404_not_html(client):
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")


def test_static_handler_does_not_escape_dist(client):
    for path in ("/../secret.txt", "/%2e%2e/secret.txt", "/assets/../../secret.txt"):
        response = client.get(path)
        assert "outside the dist folder" not in response.text


def test_login_rejects_bad_password(client):
    response = client.post("/api/auth/login", data={"username": "admin", "password": "wrong"})
    assert response.status_code == 401


def test_token_signed_with_old_public_default_secret_is_rejected(client):
    forged = jwt.encode(
        {"sub": "admin", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
        "adix-paper-super-secret-key-2024",
        algorithm="HS256",
    )
    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert response.status_code == 401


def test_public_registration_endpoint_is_removed(client):
    payload = {"username": "intruder", "ime": "I", "prezime": "N", "password": "12345678"}
    assert client.post("/api/auth/register", json=payload).status_code in (404, 405)


def test_security_headers_are_sent(client):
    headers = client.get("/login").headers
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in headers["content-security-policy"]


def test_repeated_failed_logins_are_throttled(client):
    for _ in range(10):
        assert client.post("/api/auth/login", data={"username": "nobody", "password": "x"}).status_code == 401
    blocked = client.post("/api/auth/login", data={"username": "nobody", "password": "x"})
    assert blocked.status_code == 429
    assert "retry-after" in blocked.headers
    # Other accounts are unaffected.
    assert client.post("/api/auth/login", data={"username": "admin", "password": "admin-pass-123"}).status_code == 200
