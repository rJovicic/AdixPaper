"""Photo attachments: formats, limits, metadata stripping, who may see and remove them."""
from io import BytesIO

from PIL import Image

from tests.test_kvarovi import report


def photo(fmt="JPEG", size=(2400, 1800), exif_gps=False):
    image = Image.new("RGB", size, (40, 90, 160))
    out = BytesIO()
    kwargs = {}
    if exif_gps:
        exif = Image.Exif()
        exif[0x8825] = {1: "N", 2: (45.0, 48.0, 0.0)}  # GPSInfo
        exif[0x010F] = "PhoneMaker"
        kwargs["exif"] = exif
    image.save(out, format=fmt, **kwargs)
    return out.getvalue()


def upload(client, headers, kvar_id, data, name="kvar.jpg", mime="image/jpeg"):
    return client.post(f"/api/kvarovi/{kvar_id}/prilozi", files={"datoteka": (name, data, mime)}, headers=headers)


def test_reporter_attaches_a_photo_stored_small_and_without_metadata(client, admin, make_user, machine):
    _, worker = make_user()
    kvar = report(client, worker, machine)
    response = upload(client, worker, kvar["id"], photo(exif_gps=True), name="../../IMG_0001.jpg")
    assert response.status_code == 201, response.text
    meta = response.json()
    assert meta["naziv"] == "IMG_0001.jpg"
    assert max(meta["sirina"], meta["visina"]) == 1600

    raw = client.get(f"/api/kvarovi/{kvar['id']}/prilozi/{meta['id']}", headers=admin)
    assert raw.status_code == 200 and raw.headers["content-type"] == "image/jpeg"
    stored = Image.open(BytesIO(raw.content))
    assert stored.format == "JPEG" and stored.size == (1600, 1200)
    assert not stored.getexif()  # GPS and camera data dropped

    assert client.get(f"/api/kvarovi/{kvar['id']}", headers=worker).json()["broj_priloga"] == 1
    listed = client.get(f"/api/kvarovi/{kvar['id']}/prilozi", headers=admin).json()
    assert [p["id"] for p in listed] == [meta["id"]]
    events = client.get(f"/api/kvarovi/{kvar['id']}/dogadjaji", headers=worker).json()
    assert any(e["tip"] == "prilog" for e in events)


def test_png_and_webp_are_accepted_other_files_are_not(client, make_user, machine):
    _, worker = make_user()
    kvar = report(client, worker, machine)
    assert upload(client, worker, kvar["id"], photo("PNG", (300, 200)), "a.png", "image/png").status_code == 201
    assert upload(client, worker, kvar["id"], photo("WEBP", (300, 200)), "a.webp", "image/webp").status_code == 201
    assert upload(client, worker, kvar["id"], b"%PDF-1.4 not an image", "a.jpg").status_code == 400
    assert upload(client, worker, kvar["id"], b"<svg xmlns='http://www.w3.org/2000/svg'/>", "a.svg", "image/svg+xml").status_code == 400
    gif = BytesIO()
    Image.new("RGB", (10, 10)).save(gif, format="GIF")
    assert upload(client, worker, kvar["id"], gif.getvalue(), "a.gif", "image/gif").status_code == 400


def test_oversized_uploads_are_refused(client, make_user, machine):
    _, worker = make_user()
    kvar = report(client, worker, machine)
    assert upload(client, worker, kvar["id"], b"\xff\xd8" + b"0" * (12 * 1024 * 1024 + 10)).status_code == 413


def test_a_fault_holds_at_most_six_photos(client, make_user, machine):
    _, worker = make_user()
    kvar = report(client, worker, machine)
    small = photo(size=(200, 150))
    for _ in range(6):
        assert upload(client, worker, kvar["id"], small).status_code == 201
    assert upload(client, worker, kvar["id"], small).status_code == 400


def test_other_workers_cannot_see_add_or_remove_photos(client, admin, make_user, machine):
    _, owner = make_user()
    _, other = make_user()
    kvar = report(client, owner, machine)
    meta = upload(client, owner, kvar["id"], photo(size=(200, 150))).json()
    base = f"/api/kvarovi/{kvar['id']}/prilozi"
    assert client.get(base, headers=other).status_code == 404
    assert client.get(f"{base}/{meta['id']}", headers=other).status_code == 404
    assert upload(client, other, kvar["id"], photo(size=(200, 150))).status_code == 404
    assert client.delete(f"{base}/{meta['id']}", headers=other).status_code == 404
    assert client.get(f"{base}/{meta['id']}").status_code == 401


def test_worker_removes_own_photo_only_while_open_leads_any_time(client, admin, make_user, machine):
    _, worker = make_user()
    kvar = report(client, worker, machine)
    base = f"/api/kvarovi/{kvar['id']}/prilozi"
    by_lead = upload(client, admin, kvar["id"], photo(size=(200, 150))).json()
    mine = upload(client, worker, kvar["id"], photo(size=(200, 150))).json()
    second = upload(client, worker, kvar["id"], photo(size=(200, 150))).json()

    assert client.delete(f"{base}/{by_lead['id']}", headers=worker).status_code == 403
    assert client.delete(f"{base}/{mine['id']}", headers=worker).status_code == 204

    client.put(f"/api/kvarovi/{kvar['id']}", json={"status": "Riješeno", "sto_je_uradjeno": "Gotovo"}, headers=admin)
    assert client.delete(f"{base}/{second['id']}", headers=worker).status_code == 403
    assert client.delete(f"{base}/{second['id']}", headers=admin).status_code == 204
    assert [p["id"] for p in client.get(base, headers=admin).json()] == [by_lead["id"]]


def test_deleting_a_fault_removes_its_photos(client, admin, make_user, machine):
    _, worker = make_user()
    kvar = report(client, worker, machine)
    meta = upload(client, worker, kvar["id"], photo(size=(200, 150))).json()
    assert client.delete(f"/api/kvarovi/{kvar['id']}", headers=admin).status_code == 204
    assert client.get(f"/api/kvarovi/{kvar['id']}/prilozi/{meta['id']}", headers=admin).status_code == 404
