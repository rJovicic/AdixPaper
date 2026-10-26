"""Populate a LOCAL development database with realistic demo data through the API.

Usage: python e2e/seed-demo.py [base_url]   (default http://localhost:8000)
Never point this at production.
"""
import json
import sys
import urllib.parse
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
if "railway.app" in BASE:
    sys.exit("Refusing to seed a Railway URL.")


def call(method, path, body=None, token=None, form=False):
    headers = {}
    data = None
    if body is not None:
        if form:
            data = urllib.parse.urlencode(body).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as res:
        raw = res.read()
        return json.loads(raw) if raw else None


def login(username, password):
    return call("POST", "/api/auth/login", {"username": username, "password": password}, form=True)["access_token"]


admin = login("admin", "admin-pass-123")
users = [
    ("ivana.k", "Ivana", "Kovač", "voditelj", "Održavanje"),
    ("marko.h", "Marko", "Horvat", "radnik", "Proizvodnja – smjena A"),
    ("ana.b", "Ana", "Babić", "radnik", "Proizvodnja – smjena B"),
]
for username, ime, prezime, rola, odjel in users:
    call("POST", "/api/korisnici", {"username": username, "ime": ime, "prezime": prezime, "rola": rola,
                                     "odjel": odjel, "password": "demo-pass-123"}, admin)

machines = [
    ("Rezačica Perini 1", "Rezačica", "Cupup d.o.o", "Hala A", ["Nož", "Transporter", "Senzor rolne"]),
    ("Linija za salvete 2", "Linija", "Cupup d.o.o", "Hala A", ["Embosser", "Pakirka", "Pneumatika"]),
    ("Namatalica Fabio", "Namatalica", "Delt papir d.o.o", "Hala B", ["Motor", "Kočnica"]),
    ("Pakirka Casmatic", "Pakirka", "Delt papir d.o.o", "Hala B", []),
]
ids = {}
for naziv, tip, tvrtka, lokacija, comps in machines:
    m = call("POST", "/api/oprema", {"naziv": naziv, "tip": tip, "tvrtka": tvrtka, "lokacija": lokacija}, admin)
    ids[naziv] = (m["id"], [call("POST", f"/api/oprema/{m['id']}/komponente", {"naziv": c}, admin)["id"] for c in comps])

marko = login("marko.h", "demo-pass-123")
ana = login("ana.b", "demo-pass-123")
faults = [
    (marko, "Rezačica Perini 1", 0, "Nož ne reže do kraja", "Rez ostaje nepotpun na svakoj trećoj rolni.", "Hitno"),
    (ana, "Linija za salvete 2", 2, "Curi zrak na ventilu", "Čuje se šištanje kod ventila V3.", "Normalno"),
    (marko, "Namatalica Fabio", 0, "Motor se pregrijava", None, "Hitno"),
    (ana, "Pakirka Casmatic", None, "Folija se zaglavljuje", "Zastoj otprilike svakih 20 minuta.", "Normalno"),
    (marko, "Linija za salvete 2", 1, "Pakirka preskače takt", None, "Nisko"),
]
created = []
for token, machine, comp_index, naslov, opis, prioritet in faults:
    oprema_id, comps = ids[machine]
    body = {"oprema_id": oprema_id, "naslov": naslov, "opis": opis, "prioritet": prioritet,
            "komponenta_id": comps[comp_index] if comp_index is not None else None}
    created.append(call("POST", "/api/kvarovi", body, token))

part = call("GET", "/api/rezervni-dijelovi?search=Relej", None, admin)[0]
call("PUT", f"/api/kvarovi/{created[1]['id']}", {"status": "U rješavanju"}, admin)
call("PUT", f"/api/kvarovi/{created[3]['id']}", {"status": "Riješeno", "sto_je_uradjeno": "Podešen vodič folije.",
                                                 "trajanje_min": 45, "troskovi": "35.00",
                                                 "utroseni_dijelovi": [{"rezervni_dio_id": part["id"], "kolicina": "1"}]}, admin)
call("POST", f"/api/kvarovi/{created[1]['id']}/komentari", {"tekst": "Naručen novi ventil, stiže sutra.", "interno": False}, admin)
print("Demo data ready:", len(created), "faults")
