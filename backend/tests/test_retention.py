"""Photo retention: photos go 12 calendar months after resolution (plant time); nothing else is touched."""
from datetime import date, datetime, timezone

import pytest
from sqlalchemy import text

from app import retention
from app.config import settings
from app.database import SessionLocal, engine
from app.models import Kvar, KvarDogadjaj, KvarPrilog, StatusKvaraEnum, ZadatakIzvrsenje
from app.timeutil import PLANT_TZ

from conftest import unique


def zagreb(*args):
    return datetime(*args, tzinfo=PLANT_TZ).astimezone(timezone.utc)


@pytest.fixture()
def clean(client):
    """Each test starts with no run history and no photos on old resolved faults."""
    def wipe():
        db = SessionLocal()
        try:
            db.query(ZadatakIzvrsenje).delete()
            db.query(KvarPrilog).delete()
            db.commit()
        finally:
            db.close()
    wipe()
    yield
    wipe()


@pytest.fixture()
def resolved_fault(client, admin, machine):
    """A fault resolved at `resolved_at` (UTC) with `photos` photos, written straight to the database."""
    me = client.get("/api/auth/me", headers=admin).json()

    def _make(resolved_at, photos=2, status=StatusKvaraEnum.rijeseno):
        db = SessionLocal()
        try:
            kvar = Kvar(
                oprema_id=machine["id"], prijavio_id=me["id"], naslov=unique("Stari kvar "),
                status=status, datum_rjesavanja=resolved_at,
            )
            db.add(kvar)
            db.flush()
            for n in range(photos):
                db.add(KvarPrilog(kvar_id=kvar.id, korisnik_id=me["id"], naziv=f"f{n}.jpg", mime="image/jpeg", velicina=3, sadrzaj=b"jpg"))
            db.commit()
            return kvar.id
        finally:
            db.close()
    return _make


def photo_count(kvar_id):
    db = SessionLocal()
    try:
        return db.query(KvarPrilog).filter(KvarPrilog.kvar_id == kvar_id).count()
    finally:
        db.close()


def runs():
    db = SessionLocal()
    try:
        return [(r.status, r.nacin, r.obrisano) for r in retention.recent_runs(db)]
    finally:
        db.close()


# --- The calendar rule ------------------------------------------------------------------------

@pytest.mark.parametrize("resolved, expires", [
    (date(2026, 3, 15), date(2027, 3, 15)),
    (date(2028, 2, 29), date(2029, 2, 28)),  # leap day clamps
    (date(2026, 1, 31), date(2027, 1, 31)),
    (date(2026, 12, 31), date(2027, 12, 31)),
])
def test_twelve_calendar_months(resolved, expires):
    assert retention.add_months(resolved, 12) == expires


def test_the_resolution_day_is_counted_in_plant_time():
    # 23:30 UTC on 14 March is already 15 March in Zagreb.
    assert retention.photos_expire_on(datetime(2026, 3, 14, 23, 30, tzinfo=timezone.utc)) == date(2027, 3, 15)
    # Summer time: 22:30 UTC on 14 July is 00:30 on 15 July in Zagreb.
    assert retention.photos_expire_on(datetime(2026, 7, 14, 22, 30, tzinfo=timezone.utc)) == date(2027, 7, 15)
    assert retention.photos_expire_on(datetime(2026, 7, 14, 21, 30, tzinfo=timezone.utc)) == date(2027, 7, 14)


def test_photos_stay_until_midnight_plant_time_on_the_anniversary(clean, resolved_fault):
    kvar_id = resolved_fault(zagreb(2026, 3, 15, 10, 0))
    one_minute_before = zagreb(2027, 3, 14, 23, 59)
    result = retention.run_photo_retention(now=one_minute_before, mode="delete")
    assert result.status == "ok" and kvar_id not in result.fault_ids
    assert photo_count(kvar_id) == 2

    at_midnight = zagreb(2027, 3, 15, 0, 0)
    result = retention.run_photo_retention(now=at_midnight, mode="delete")
    assert kvar_id in result.fault_ids and result.deleted == 2
    assert photo_count(kvar_id) == 0


def test_leap_day_resolution_expires_on_28_february(clean, resolved_fault):
    kvar_id = resolved_fault(zagreb(2028, 2, 29, 12, 0), photos=1)
    retention.run_photo_retention(now=zagreb(2029, 2, 27, 23, 59), mode="delete")
    assert photo_count(kvar_id) == 1
    retention.run_photo_retention(now=zagreb(2029, 2, 28, 0, 0), mode="delete")
    assert photo_count(kvar_id) == 0


# --- What is kept -------------------------------------------------------------------------------

def test_only_photos_go_the_fault_and_its_timeline_stay(clean, client, admin, resolved_fault):
    kvar_id = resolved_fault(zagreb(2026, 1, 10, 9, 0), photos=3)
    result = retention.run_photo_retention(now=zagreb(2027, 1, 10, 6, 0), mode="delete")
    assert result.deleted == 3 and result.status == "ok"

    fault = client.get(f"/api/kvarovi/{kvar_id}", headers=admin)
    assert fault.status_code == 200 and fault.json()["status"] == "Riješeno"
    assert client.get(f"/api/kvarovi/{kvar_id}/prilozi", headers=admin).json() == []
    events = client.get(f"/api/kvarovi/{kvar_id}/dogadjaji", headers=admin).json()
    entry = next(e for e in events if e["tip"] == "retencija")
    assert entry["podaci"]["count"] == 3 and not entry["interno"]


def test_open_waiting_and_recent_faults_keep_their_photos(clean, resolved_fault):
    long_ago = zagreb(2025, 1, 1, 9, 0)
    still_open = resolved_fault(None, status=StatusKvaraEnum.u_rjesavanju)
    waiting = resolved_fault(None, status=StatusKvaraEnum.na_cekanju)
    # Inconsistent data (a date on a fault that is not resolved) must not qualify either.
    odd = resolved_fault(long_ago, status=StatusKvaraEnum.na_cekanju)
    recent = resolved_fault(zagreb(2026, 6, 1, 9, 0))
    result = retention.run_photo_retention(now=zagreb(2027, 1, 1, 6, 0), mode="delete")
    assert result.deleted == 0
    for kvar_id in (still_open, waiting, odd, recent):
        assert photo_count(kvar_id) == 2


def test_a_reopened_fault_keeps_its_photos_and_resolving_again_restarts_the_clock(clean, client, admin, resolved_fault):
    kvar_id = resolved_fault(zagreb(2025, 9, 1, 9, 0))
    fault = client.get(f"/api/kvarovi/{kvar_id}", headers=admin).json()
    reopened = client.put(f"/api/kvarovi/{kvar_id}", json={"status": "U rješavanju", "verzija": fault["verzija"]}, headers=admin)
    assert reopened.status_code == 200 and reopened.json()["datum_rjesavanja"] is None

    retention.run_photo_retention(now=zagreb(2026, 10, 20, 6, 0), mode="delete")
    assert photo_count(kvar_id) == 2

    resolved = client.put(f"/api/kvarovi/{kvar_id}", json={"status": "Riješeno", "sto_je_uradjeno": "Zamijenjen ležaj", "verzija": reopened.json()["verzija"]}, headers=admin)
    assert resolved.status_code == 200
    # Resolved again "now": a run a year after the first resolution must not touch it.
    retention.run_photo_retention(now=zagreb(2026, 10, 30, 6, 0), mode="delete")
    assert photo_count(kvar_id) == 2


def test_a_fault_reopened_while_the_job_runs_is_rechecked_and_kept(clean, client, admin, resolved_fault, monkeypatch):
    kvar_id = resolved_fault(zagreb(2025, 9, 1, 9, 0))
    now = zagreb(2026, 10, 20, 6, 0)
    real_candidates = retention._candidates

    def candidates_then_reopen(db, when):
        found = real_candidates(db, when)
        fault = client.get(f"/api/kvarovi/{kvar_id}", headers=admin).json()
        assert client.put(f"/api/kvarovi/{kvar_id}", json={"status": "U rješavanju", "verzija": fault["verzija"]}, headers=admin).status_code == 200
        return found

    monkeypatch.setattr(retention, "_candidates", candidates_then_reopen)
    result = retention.run_photo_retention(now=now, mode="delete")
    assert (result.status, result.faults, result.deleted) == ("ok", 1, 0)
    assert photo_count(kvar_id) == 2


# --- Modes and limits ---------------------------------------------------------------------------

def test_dry_run_counts_and_deletes_nothing(clean, resolved_fault):
    first = resolved_fault(zagreb(2025, 1, 5, 9, 0), photos=2)
    second = resolved_fault(zagreb(2025, 2, 5, 9, 0), photos=3)
    result = retention.run_photo_retention(now=zagreb(2026, 10, 20, 6, 0), mode="dry-run")
    assert (result.status, result.faults, result.photos, result.deleted) == ("ok", 2, 5, 0)
    assert photo_count(first) == 2 and photo_count(second) == 3
    assert runs()[0] == ("ok", "dry-run", 0)


def test_off_is_a_kill_switch(clean, resolved_fault, monkeypatch):
    kvar_id = resolved_fault(zagreb(2025, 1, 5, 9, 0))
    monkeypatch.setattr(settings, "PHOTO_RETENTION_MODE", "off")
    result = retention.run_photo_retention(now=zagreb(2026, 10, 20, 6, 0))
    assert result.status == "preskoceno" and result.photos == 0
    assert photo_count(kvar_id) == 2
    assert retention.RetentionScheduler().tick(now=zagreb(2026, 10, 20, 6, 0)) is None


def test_the_default_mode_is_dry_run():
    assert settings.PHOTO_RETENTION_MODE == "dry-run"


def test_the_limit_is_respected_whole_faults_only_and_the_rest_follows_next_run(clean, resolved_fault):
    oldest = resolved_fault(zagreb(2025, 1, 1, 9, 0), photos=2)
    middle = resolved_fault(zagreb(2025, 2, 1, 9, 0), photos=2)
    newest = resolved_fault(zagreb(2025, 3, 1, 9, 0), photos=2)
    now = zagreb(2026, 10, 20, 6, 0)

    result = retention.run_photo_retention(now=now, mode="delete", limit=3)
    assert result.deleted == 2 and result.limit_reached  # the second fault would exceed 3
    assert (photo_count(oldest), photo_count(middle), photo_count(newest)) == (0, 2, 2)

    result = retention.run_photo_retention(now=now, mode="delete", limit=4)
    assert result.deleted == 4 and not result.limit_reached
    assert (photo_count(middle), photo_count(newest)) == (0, 0)


@pytest.mark.parametrize("kwargs, fragment", [
    ({"mode": "brisi"}, "Unknown PHOTO_RETENTION_MODE"),
    ({"mode": "delete", "now": datetime(2001, 1, 1, tzinfo=timezone.utc)}, "Clock looks wrong"),
    ({"mode": "delete", "limit": 0}, "at least 1"),
])
def test_bad_settings_and_a_wrong_clock_refuse_to_run(clean, resolved_fault, kwargs, fragment):
    kvar_id = resolved_fault(zagreb(2025, 1, 1, 9, 0))
    kwargs.setdefault("now", zagreb(2026, 10, 20, 6, 0))
    result = retention.run_photo_retention(**kwargs)
    assert result.status == "greska" and fragment in result.message
    assert photo_count(kvar_id) == 2


# --- Failures, retries, alerts, health -------------------------------------------------------------

def test_a_failure_keeps_the_fault_intact_records_the_error_and_alerts_once_on_the_third(clean, client, resolved_fault, monkeypatch):
    kvar_id = resolved_fault(zagreb(2025, 1, 1, 9, 0))
    now = zagreb(2026, 10, 20, 6, 0)
    sent = []
    monkeypatch.setattr(settings, "ALERT_WEBHOOK_URL", "https://hooks.example.invalid/x")
    monkeypatch.setattr(retention.urllib.request, "urlopen", lambda request, timeout: sent.append(request.data) or _Closable())

    real_delete = retention.KvarPrilog

    def broken_delete(db, fault_id, when):
        db.query(real_delete).filter(real_delete.kvar_id == fault_id).delete(synchronize_session=False)
        raise RuntimeError("disk on fire")  # after deleting, before commit

    monkeypatch.setattr(retention, "_delete_fault_photos", broken_delete)
    for attempt in range(1, 5):
        result = retention.run_photo_retention(now=now, mode="delete")
        assert result.status == "greska" and "disk on fire" in result.message
        assert photo_count(kvar_id) == 2  # rolled back
        assert len(sent) == (1 if attempt >= 3 else 0)  # one alert, not one per retry

    assert client.get("/health/jobs").status_code == 503

    monkeypatch.undo()
    result = retention.run_photo_retention(now=now, mode="delete")
    assert result.status == "ok" and photo_count(kvar_id) == 0
    db = SessionLocal()
    try:
        assert retention.consecutive_failures(db) == 0
    finally:
        db.close()


class _Closable:
    def close(self):
        pass


def test_health_reports_ok_stale_and_off(clean, client, monkeypatch):
    monkeypatch.setattr(retention, "STARTED", zagreb(2026, 10, 19, 6, 0))
    monkeypatch.setattr(retention, "utcnow", lambda: zagreb(2026, 10, 20, 6, 0))
    assert client.get("/health/jobs").json() == {"photo_retention": "pending", "mode": "dry-run"}  # just deployed
    monkeypatch.setattr(retention, "utcnow", lambda: zagreb(2026, 10, 22, 6, 0))
    assert client.get("/health/jobs").status_code == 503  # never ran in 48 h
    monkeypatch.setattr(retention, "utcnow", lambda: zagreb(2026, 10, 20, 6, 0))
    retention.run_photo_retention(now=zagreb(2026, 10, 20, 5, 0), mode="dry-run")
    response = client.get("/health/jobs")
    assert response.status_code == 200 and response.json()["photo_retention"] == "ok"
    monkeypatch.setattr(retention, "utcnow", lambda: zagreb(2026, 10, 23, 6, 0))
    assert client.get("/health/jobs").json()["photo_retention"] == "stale"
    monkeypatch.setattr(settings, "PHOTO_RETENTION_MODE", "off")
    assert client.get("/health/jobs").status_code == 200


def test_the_scheduler_runs_once_a_day_after_the_hour_and_retries_failures(clean, monkeypatch):
    scheduler = retention.RetentionScheduler()
    monkeypatch.setattr(settings, "PHOTO_RETENTION_HOUR", 3)
    assert scheduler.tick(now=zagreb(2026, 10, 20, 2, 30)) is None  # before 03:00 plant time
    assert scheduler.tick(now=zagreb(2026, 10, 20, 3, 5)).status == "ok"
    assert scheduler.tick(now=zagreb(2026, 10, 20, 4, 5)) is None  # done for today

    monkeypatch.setattr(retention, "_candidates", lambda db, now: (_ for _ in ()).throw(RuntimeError("db hiccup")))
    assert scheduler.tick(now=zagreb(2026, 10, 21, 3, 5)).status == "greska"
    monkeypatch.undo()
    monkeypatch.setattr(settings, "PHOTO_RETENTION_HOUR", 3)
    assert scheduler.tick(now=zagreb(2026, 10, 21, 4, 5)).status == "ok"  # retried an hour later
    assert scheduler.tick(now=zagreb(2026, 10, 21, 5, 5)) is None


def test_the_scheduler_thread_starts_and_stops(clean):
    scheduler = retention.RetentionScheduler(interval=0.05)
    scheduler.start()
    scheduler.stop()
    assert not scheduler._thread.is_alive()


@pytest.mark.skipif(engine.dialect.name != "postgresql", reason="advisory locks are PostgreSQL only")
def test_a_second_runner_skips_while_one_holds_the_lock(clean, resolved_fault):
    kvar_id = resolved_fault(zagreb(2025, 1, 1, 9, 0))
    with engine.connect() as other:
        assert other.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": retention.ADVISORY_LOCK_KEY}).scalar()
        try:
            result = retention.run_photo_retention(now=zagreb(2026, 10, 20, 6, 0), mode="delete")
            assert result.status == "preskoceno"
            assert photo_count(kvar_id) == 2
        finally:
            other.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": retention.ADVISORY_LOCK_KEY})
    assert retention.run_photo_retention(now=zagreb(2026, 10, 20, 6, 0), mode="delete").deleted == 2


def test_timeline_entry_is_written_with_the_deletion(clean, resolved_fault):
    kvar_id = resolved_fault(zagreb(2025, 1, 1, 9, 0), photos=1)
    retention.run_photo_retention(now=zagreb(2026, 10, 20, 6, 0), mode="delete")
    db = SessionLocal()
    try:
        entries = db.query(KvarDogadjaj).filter(KvarDogadjaj.kvar_id == kvar_id, KvarDogadjaj.tip == "retencija").all()
        assert len(entries) == 1 and entries[0].podaci["pravilo_mjeseci"] == 12
    finally:
        db.close()
