"""PDF outputs: machine QR labels and the fault report."""
from tests.test_kvarovi import report


def test_machine_qr_labels(client, admin, make_user, machine):
    response = client.get(f"/api/oprema/qr-oznake.pdf?ids={machine['id']}", headers=admin)
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
    # Every machine that is not decommissioned, when no ids are given.
    assert client.get("/api/oprema/qr-oznake.pdf", headers=admin).status_code == 200
    assert client.get("/api/oprema/qr-oznake.pdf?ids=abc", headers=admin).status_code == 422
    assert client.get("/api/oprema/qr-oznake.pdf?ids=999999", headers=admin).status_code == 404
    _, worker = make_user()
    assert client.get("/api/oprema/qr-oznake.pdf", headers=worker).status_code == 403


def test_qr_link_points_at_the_machine_route():
    from app.routers.oprema import machine_link

    assert machine_link("https://adix.example/", 12) == "https://adix.example/m/12"


def test_fault_pdf_embeds_a_font_with_croatian_letters(client, admin, make_user, machine):
    _, worker = make_user()
    report(client, worker, machine, naslov="Čađa na ćeliji đ")
    response = client.get("/api/kvarovi/export.pdf", headers=admin)
    assert response.status_code == 200
    assert b"LiberationSans" in response.content
