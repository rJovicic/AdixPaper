"""Startup waits for a database that is not reachable yet instead of failing at once."""
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError

from app import bootstrap

BACKEND = Path(__file__).resolve().parent.parent


class FakeClock:
    def __init__(self):
        self.now = 0.0
        self.sleeps = []

    def clock(self):
        return self.now

    def sleep(self, seconds):
        self.sleeps.append(seconds)
        self.now += seconds


class FlakyEngine:
    """Fails `failures` times like an unresolvable host, then connects."""

    def __init__(self, failures):
        self.failures = failures
        self.calls = 0
        self.real = create_engine("sqlite://")

    def connect(self):
        self.calls += 1
        if self.calls <= self.failures:
            raise OperationalError("SELECT 1", {}, Exception("failed to resolve host 'postgres.railway.internal'"))
        return self.real.connect()


def test_waits_through_a_short_outage_with_backoff(monkeypatch):
    engine = FlakyEngine(failures=4)
    monkeypatch.setattr(bootstrap, "engine", engine)
    fake = FakeClock()
    attempts = bootstrap.wait_for_database(timeout=60, sleep=fake.sleep, clock=fake.clock)
    assert attempts == 5
    assert fake.sleeps == [1, 2, 4, 8]


def test_gives_up_after_the_timeout_so_the_platform_can_restart(monkeypatch):
    monkeypatch.setattr(bootstrap, "engine", FlakyEngine(failures=10_000))
    fake = FakeClock()
    with pytest.raises(OperationalError):
        bootstrap.wait_for_database(timeout=30, sleep=fake.sleep, clock=fake.clock)
    assert sum(fake.sleeps) == pytest.approx(30)
    assert max(fake.sleeps) <= 10


def test_connects_immediately_when_the_database_is_up():
    assert bootstrap.wait_for_database(timeout=5) == 1


def _free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _forward(listen_port, target_host, target_port, stop):
    """A tiny TCP forwarder: the 'database' becomes reachable once this starts."""
    server = socket.socket()
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(("127.0.0.1", listen_port))
    server.listen()
    server.settimeout(0.2)

    def pipe(src, dst):
        try:
            while data := src.recv(65536):
                dst.sendall(data)
        except OSError:
            pass
        finally:
            for s in (src, dst):
                try:
                    s.close()
                except OSError:
                    pass

    while not stop.is_set():
        try:
            client, _ = server.accept()
        except socket.timeout:
            continue
        upstream = socket.create_connection((target_host, target_port))
        threading.Thread(target=pipe, args=(client, upstream), daemon=True).start()
        threading.Thread(target=pipe, args=(upstream, client), daemon=True).start()
    server.close()


@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL", "").startswith("postgresql"), reason="needs PostgreSQL")
def test_app_starts_once_a_late_database_comes_up(tmp_path):
    real = urlsplit(os.environ["TEST_DATABASE_URL"])
    late_port = _free_port()
    late_url = urlunsplit(real._replace(netloc=f"{real.username}:{real.password}@127.0.0.1:{late_port}"))
    app_port = _free_port()
    env = {
        **os.environ,
        "DATABASE_URL": late_url,
        "SECRET_KEY": "test-secret-key-that-is-long-enough-for-hs256",
        "DB_STARTUP_TIMEOUT_SECONDS": "30",
        "AUTO_SEED_SPARE_PARTS": "false",
        "FRONTEND_DIST": str(tmp_path),
    }
    env.pop("ADMIN_USERNAME", None)
    log = open(tmp_path / "app.log", "w")
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(app_port)],
        cwd=BACKEND, env=env, stdout=log, stderr=subprocess.STDOUT,
    )
    stop = threading.Event()
    try:
        time.sleep(3)  # the database is "down" for a few seconds: nothing listens on late_port
        assert proc.poll() is None, "the app exited instead of waiting for the database"
        threading.Thread(target=_forward, args=(late_port, real.hostname, real.port or 5432, stop), daemon=True).start()
        deadline = time.time() + 25
        status = None
        while time.time() < deadline:
            try:
                status = urllib.request.urlopen(f"http://127.0.0.1:{app_port}/health", timeout=2).status
                break
            except OSError:
                time.sleep(0.5)
        assert status == 200
        assert "Database not reachable yet" in (tmp_path / "app.log").read_text()
    finally:
        proc.terminate()
        proc.wait(timeout=10)
        stop.set()
        log.close()
