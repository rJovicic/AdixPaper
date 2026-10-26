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
