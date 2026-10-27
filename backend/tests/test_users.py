from tests.conftest import login


def test_admin_cannot_lock_themselves_out(client, admin):
    me = client.get("/api/auth/me", headers=admin).json()
    response = client.put(f"/api/korisnici/{me['id']}", json={"aktivan": False}, headers=admin)
    assert response.status_code == 400
    response = client.put(f"/api/korisnici/{me['id']}", json={"rola": "radnik"}, headers=admin)
    assert response.status_code == 400
    assert client.get("/api/auth/me", headers=admin).status_code == 200


def test_several_users_without_email_can_be_created(make_user):
    make_user(email="")
    make_user(email="")


def test_duplicate_username_is_rejected_case_insensitively(client, admin, make_user):
    user, _ = make_user()
    payload = {"username": user["username"].upper(), "ime": "X", "prezime": "Y", "password": "12345678"}
    assert client.post("/api/korisnici", json=payload, headers=admin).status_code == 400


def test_password_rules(client, admin):
    payload = {"username": "shortpw", "ime": "X", "prezime": "Y", "password": "123"}
    assert client.post("/api/korisnici", json=payload, headers=admin).status_code == 422


def test_worker_cannot_manage_users(client, make_user):
    _, worker = make_user()
    assert client.get("/api/korisnici", headers=worker).status_code == 403


def test_deactivated_user_loses_access(client, admin, make_user):
    user, worker = make_user()
    assert client.put(f"/api/korisnici/{user['id']}", json={"aktivan": False}, headers=admin).status_code == 200
    assert client.get("/api/auth/me", headers=worker).status_code == 401


def test_password_change_by_admin_ends_existing_sessions(client, admin, make_user):
    user, old_session = make_user()
    assert client.put(f"/api/korisnici/{user['id']}", json={"password": "brand-new-pass-1"}, headers=admin).status_code == 200
    assert client.get("/api/auth/me", headers=old_session).status_code == 401
    assert login(client, user["username"], "brand-new-pass-1")


def test_user_changes_own_password(client, make_user):
    user, session = make_user(password="old-password-1")
    other_device = login(client, user["username"], "old-password-1")
    wrong = client.post("/api/auth/password", json={"current_password": "nope-nope", "new_password": "new-password-1"}, headers=session)
    assert wrong.status_code == 400
    same = client.post("/api/auth/password", json={"current_password": "old-password-1", "new_password": "old-password-1"}, headers=session)
    assert same.status_code == 400
    short = client.post("/api/auth/password", json={"current_password": "old-password-1", "new_password": "short"}, headers=session)
    assert short.status_code == 422

    changed = client.post("/api/auth/password", json={"current_password": "old-password-1", "new_password": "new-password-1"}, headers=session)
    assert changed.status_code == 200
    fresh = {"Authorization": f"Bearer {changed.json()['access_token']}"}
    assert client.get("/api/auth/me", headers=fresh).status_code == 200
    assert client.get("/api/auth/me", headers=other_device).status_code == 401
    assert login(client, user["username"], "new-password-1")
