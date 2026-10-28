"""Live updates: who receives which fault events, and that the stream reports changes as they happen."""
import json
import queue
import socket
import threading
import time

import httpx
import pytest
import uvicorn

from app.live import Broker
from app.main import app

from conftest import unique


# --- Who may see what (no server needed) ---------------------------------------------------------

def _collect(broker, user_id, manager):
    """Subscribe on a private loop; returns a function that drains what arrived."""
    import asyncio
    loop = asyncio.new_event_loop()
    holder = {}

    async def make():
        holder["sub"] = broker.subscribe(user_id, manager)
    loop.run_until_complete(make())

    def drain():
        loop.run_until_complete(asyncio.sleep(0))
        items = []
        while not holder["sub"].queue.empty():
            items.append(holder["sub"].queue.get_nowait())
        return items
    return holder["sub"], drain


def test_managers_get_every_fault_workers_only_their_own_and_never_internal_notes():
    broker = Broker()
    _, lead = _collect(broker, user_id=1, manager=True)
    _, reporter = _collect(broker, user_id=2, manager=False)
    _, other_worker = _collect(broker, user_id=3, manager=False)

    broker.publish(10, "created", reporter_id=2)
    broker.publish(10, "comment", reporter_id=2, internal=True)
    broker.publish(11, "created", reporter_id=3)

    assert [(e["kvar_id"], e["akcija"]) for e in lead()] == [(10, "created"), (10, "comment"), (11, "created")]
    assert [(e["kvar_id"], e["akcija"]) for e in reporter()] == [(10, "created")]
    assert [(e["kvar_id"], e["akcija"]) for e in other_worker()] == [(11, "created")]


def test_events_carry_ids_only_and_increasing_sequence_numbers():
    broker = Broker()
    _, lead = _collect(broker, user_id=1, manager=True)
    broker.publish(5, "updated", reporter_id=9)
    broker.publish(5, "updated", reporter_id=9)
    first, second = lead()
    assert set(first) == {"seq", "kvar_id", "akcija"}
    assert second["seq"] > first["seq"]


def test_a_subscriber_that_falls_behind_is_told_to_resync_instead_of_growing_forever():
    broker = Broker()
    subscriber, _ = _collect(broker, user_id=1, manager=True)
    for n in range(subscriber.queue.maxsize + 5):
        broker.publish(n, "updated", reporter_id=None)
    import asyncio
    subscriber.loop.run_until_complete(asyncio.sleep(0))
    assert subscriber.overflowed


# --- The real stream -------------------------------------------------------------------------------

def _free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture(scope="module")
def live_server(client):
    """The same app (same database and broker) behind a real HTTP server, so the stream is not buffered."""
    app.state.live_heartbeat = 0.5
    port = _free_port()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, lifespan="off", log_level="warning"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.05)
    yield f"http://127.0.0.1:{port}"
    server.should_exit = True
    thread.join(timeout=10)
    app.state.live_heartbeat = None
    del app.state.live_heartbeat


class Stream:
    """Reads one SSE stream in a background thread; events land in a queue."""

    def __init__(self, base, headers):
        self.events = queue.Queue()
        self.status = None
        self._ready = threading.Event()
        self._thread = threading.Thread(target=self._run, args=(base, headers), daemon=True)
        self._thread.start()
        assert self._ready.wait(10), "stream did not open"

    def _run(self, base, headers):
        try:
            with httpx.stream("GET", f"{base}/api/uzivo", headers=headers, timeout=30) as response:
                self.status = response.status_code
                self._ready.set()
                name = None
                for line in response.iter_lines():
                    if line.startswith("event: "):
                        name = line[7:]
                    elif line.startswith("data: "):
                        self.events.put((name, json.loads(line[6:])))
                    elif line == "":
                        name = None
        except Exception as error:  # noqa: BLE001 - surfaced through the queue
            self.events.put(("error", str(error)))
            self._ready.set()

    def next(self, name, timeout=5, match=None):
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                event, data = self.events.get(timeout=max(0.01, deadline - time.time()))
            except queue.Empty:
                break
            if event == name and (match is None or match(data)):
                return data
        raise AssertionError(f"no {name!r} event within {timeout} s")

    def nothing_for(self, kvar_id, seconds=1.0):
        deadline = time.time() + seconds
        while time.time() < deadline:
            try:
                event, data = self.events.get(timeout=max(0.01, deadline - time.time()))
            except queue.Empty:
                return True
            if event == "kvar" and data["kvar_id"] == kvar_id:
                return False
        return True


def test_the_stream_needs_a_valid_token(live_server):
    response = httpx.get(f"{live_server}/api/uzivo", timeout=5)
    assert response.status_code == 401
    response = httpx.get(f"{live_server}/api/uzivo", headers={"Authorization": "Bearer nonsense"}, timeout=5)
    assert response.status_code == 401


def test_a_new_report_and_each_change_reach_the_lead_and_the_reporter_live(live_server, client, admin, make_user, machine):
    worker, worker_headers = make_user()
    _, other_headers = make_user()
    lead_stream = Stream(live_server, admin)
    worker_stream = Stream(live_server, worker_headers)
    other_stream = Stream(live_server, other_headers)
    for stream in (lead_stream, worker_stream, other_stream):
        assert stream.status == 200
        stream.next("hello")

    created = client.post("/api/kvarovi", json={"oprema_id": machine["id"], "naslov": unique("Curi ulje "), "prioritet": "Hitno"}, headers=worker_headers)
    assert created.status_code == 201
    fault = created.json()
    assert lead_stream.next("kvar", match=lambda e: e["kvar_id"] == fault["id"])["akcija"] == "created"
    assert worker_stream.next("kvar", match=lambda e: e["kvar_id"] == fault["id"])["akcija"] == "created"

    # Take it, put it on hold, resolve, reopen: every step reaches both.
    steps = [
        {"status": "U rješavanju"},
        {"status": "Na čekanju", "razlog_cekanja": "dijelovi"},
        {"status": "Riješeno", "sto_je_uradjeno": "Zamijenjena brtva"},
        {"status": "U rješavanju"},
    ]
    version = fault["verzija"]
    for step in steps:
        saved = client.put(f"/api/kvarovi/{fault['id']}", json={**step, "verzija": version}, headers=admin)
        assert saved.status_code == 200, saved.text
        version = saved.json()["verzija"]
        assert lead_stream.next("kvar", match=lambda e: e["kvar_id"] == fault["id"])["akcija"] == "updated"
        assert worker_stream.next("kvar", match=lambda e: e["kvar_id"] == fault["id"])["akcija"] == "updated"

    # An internal note reaches the lead, not the worker.
    note = client.post(f"/api/kvarovi/{fault['id']}/komentari", json={"tekst": "Interno", "interno": True}, headers=admin)
    assert note.status_code == 201
    assert lead_stream.next("kvar", match=lambda e: e["kvar_id"] == fault["id"])["akcija"] == "comment"
    assert worker_stream.nothing_for(fault["id"])

    # Another worker never hears about this fault at all.
    assert other_stream.nothing_for(fault["id"], seconds=0.5)


def test_the_stream_ends_when_the_session_is_revoked(live_server, client, make_user):
    worker, headers = make_user(password="worker-pass-1")
    stream = Stream(live_server, headers)
    stream.next("hello")
    time.sleep(1.1)  # tokens carry whole-second issue times; make the change strictly later
    changed = client.post("/api/auth/password", json={"current_password": "worker-pass-1", "new_password": "worker-pass-2"}, headers=headers)
    assert changed.status_code == 200, changed.text
    stream.next("auth", timeout=5)


def test_live_server_still_serves_normal_requests(live_server):
    assert httpx.get(f"{live_server}/health", timeout=5).status_code == 200

