"""Check that a database created by the previous release survives the upgrade.

  python e2e/upgrade-check.py snapshot http://localhost:8000 > before.json   # old release running
  python e2e/upgrade-check.py verify   http://localhost:8000 before.json     # new release running

Read-only on the old release; the verify step writes test data. LOCAL/CI databases only.
"""
import base64
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

ADMIN = ("admin", "admin-pass-123")


def call(base, method, path, token=None, body=None, form=False, raw=None, ctype=None):
    headers = {}
    data = None
    if raw is not None:
        data, headers["Content-Type"] = raw, ctype
    elif body is not None:
        data = urllib.parse.urlencode(body).encode() if form else json.dumps(body).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded" if form else "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request) as response:
            text = response.read()
            return response.status, (json.loads(text) if text else None)
    except urllib.error.HTTPError as error:
        return error.code, None


def login(base):
    status, data = call(base, "POST", "/api/auth/login", body={"username": ADMIN[0], "password": ADMIN[1]}, form=True)
    assert status == 200, f"login failed: {status}"
    return data["access_token"]


def _unit_price(usage):
    if "jedinicna_cijena" in usage:
        return usage["jedinicna_cijena"]
    return (usage.get("rezervni_dio") or {}).get("cijena")


def snapshot(base):
    token = login(base)
    faults = call(base, "GET", "/api/kvarovi", token)[1]
    events = {f["id"]: len(call(base, "GET", f"/api/kvarovi/{f['id']}/dogadjaji", token)[1]) for f in faults}
    details = {f["id"]: call(base, "GET", f"/api/kvarovi/{f['id']}", token)[1] for f in faults}
    return {
        # Parts cost per fault as the release showed it. After the upgrade it must be the same,
        # read from the recorded unit prices (jedinicna_cijena) instead of the catalogue.
        "parts_cost": {k: round(sum(float(u["kolicina"]) * float(_unit_price(u) or 0) for u in d.get("utroseni_dijelovi", [])), 2) for k, d in details.items()},
        "faults": sorted((f["id"], f["status"], f["prioritet"], f["naslov"]) for f in faults),
        "events": events,
        "machines": len(call(base, "GET", "/api/oprema", token)[1]),
        "users": len(call(base, "GET", "/api/korisnici", token)[1]),
        "parts": len(call(base, "GET", "/api/rezervni-dijelovi", token)[1]),
    }


def verify(base, before):
    token = login(base)
    after = snapshot(base)
    assert [list(f) for f in after["faults"]] == before["faults"], "faults changed during the upgrade"
    assert {int(k): v for k, v in before["events"].items()} == {int(k): v for k, v in after["events"].items()}, "timeline changed"
    for key in ("machines", "users", "parts"):
        assert after[key] == before[key], f"{key} changed: {before[key]} -> {after[key]}"
    assert before["faults"], "nothing to check: seed the old release first"

    assert {int(k): v for k, v in before["parts_cost"].items()} == {int(k): v for k, v in after["parts_cost"].items()}, "parts costs changed"
    for fault_id, fault_status, *_ in before["faults"]:
        status, fault = call(base, "GET", f"/api/kvarovi/{fault_id}", token)
        # Every fault that left "Novo" got its first response from its own record.
        assert fault_status == "Novo" or fault["datum_odziva"], f"fault {fault_id} has no first response after the upgrade"

    # Machine → component hierarchy (2026-10-30): every machine and component got a QR identifier
    # that resolves to it; identifiers stay empty; the component list still answers.
    machines = call(base, "GET", "/api/oprema", token)[1]
    for machine in machines:
        assert machine["qr_oznaka"], f"machine {machine['id']} has no QR identifier"
        status, target = call(base, "GET", f"/api/qr/{machine['qr_oznaka']}", token)
        assert status == 200 and target["oprema"]["id"] == machine["id"], f"QR of machine {machine['id']} does not resolve"
        for component in call(base, "GET", f"/api/oprema/{machine['id']}/komponente", token)[1]:
            status, target = call(base, "GET", f"/api/qr/{component['qr_oznaka']}", token)
            assert status == 200 and target["komponenta"]["id"] == component["id"], f"QR of component {component['id']} does not resolve"
    assert len({m["qr_oznaka"] for m in machines}) == len(machines), "duplicate machine QR identifiers"

    fault_id = before["faults"][0][0]
    status, fault = call(base, "GET", f"/api/kvarovi/{fault_id}", token)
    assert status == 200 and fault["verzija"] == 1, "existing faults must start at version 1"
    assert "razlozi_paznje" in fault and fault["razlog_cekanja"] is None
    for path in ("/api/dashboard/pregled", "/api/dashboard/analitika?period=30d", "/api/kvarovi?limit=5", f"/api/kvarovi/{fault_id}/prilozi"):
        status, _ = call(base, "GET", path, token)
        assert status == 200, f"{path} -> {status}"

    open_fault = next(f for f in before["faults"] if f[1] != "Riješeno")[0]
    status, saved = call(base, "PUT", f"/api/kvarovi/{open_fault}", token, {"napomene_voditelja": "upgrade check", "verzija": 1})
    assert status == 200 and saved["verzija"] == 2, f"save with version failed: {status}"
    status, _ = call(base, "PUT", f"/api/kvarovi/{open_fault}", token, {"napomene_voditelja": "stale", "verzija": 1})
    assert status == 409, f"stale save should be refused, got {status}"

    # A valid 4x3 PNG (the server decodes and re-encodes every photo).
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAFElEQVR4nGPUiFrAAANMDEgAhQMAKg4BKHNpEfAAAAAASUVORK5CYII=")
    boundary = "upgradecheck"
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"datoteka\"; filename=\"a.png\"\r\nContent-Type: image/png\r\n\r\n").encode() + png + f"\r\n--{boundary}--\r\n".encode()
    status, _ = call(base, "POST", f"/api/kvarovi/{open_fault}/prilozi", token, raw=body, ctype=f"multipart/form-data; boundary={boundary}")
    assert status == 201, f"photo upload on the upgraded schema failed: {status}"
    print(f"upgrade OK: {len(before['faults'])} faults, {sum(before['events'].values())} events, "
          f"{before['machines']} machines, {before['users']} users, {before['parts']} parts unchanged; new features work")


if __name__ == "__main__":
    if "railway.app" in sys.argv[2]:
        sys.exit("Refusing to run against a Railway URL.")
    if sys.argv[1] == "snapshot":
        print(json.dumps(snapshot(sys.argv[2].rstrip("/"))))
    else:
        verify(sys.argv[2].rstrip("/"), json.load(open(sys.argv[3])))
