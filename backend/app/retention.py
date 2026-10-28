"""Photo retention: a fault's photos are removed 12 calendar months after it was resolved.

Rule (owner's decision, 2026-10-28):
- The clock is the fault's resolution date in plant time (Europe/Zagreb). A fault resolved on
  15 March 2026 (any time that day, plant time) loses its photos from 00:00 on 15 March 2027.
  A fault resolved on 29 February counts from 28 February of the following year.
- Only resolved faults qualify. Reopening clears the resolution date, so the photos are kept;
  resolving again restarts the clock.
- The fault, its timeline and its work record stay. Each fault whose photos are removed gets a
  timeline entry; every run is recorded in `zadaci_izvrsenja`.

Safety:
- `PHOTO_RETENTION_MODE`: "off" (kill switch), "dry-run" (count only; the default), "delete".
- At most `PHOTO_RETENTION_MAX_PER_RUN` photos per run, whole faults only.
- One runner at a time (PostgreSQL advisory lock). Each fault is re-checked under a row lock,
  so a fault reopened while the job runs keeps its photos.
- The job refuses to run when the clock is implausible.
- Failures are recorded; the next hourly check retries. After 3 failed runs in a row it logs
  an error, calls `ALERT_WEBHOOK_URL` once, and `/health/jobs` answers 503.
"""
from __future__ import annotations

import calendar
import json
import logging
import threading
import urllib.request
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from .config import settings
from .database import SessionLocal, engine
from .live import publish_fault
from .models import Kvar, KvarDogadjaj, KvarPrilog, StatusKvaraEnum, ZadatakIzvrsenje
from .timeutil import PLANT_TZ, as_utc, utcnow

logger = logging.getLogger("adixpaper")

JOB = "foto_retencija"
RETENTION_MONTHS = 12
MODES = ("off", "dry-run", "delete")
FAILURES_BEFORE_ALERT = 3
STALE_AFTER = timedelta(hours=48)
CHECK_EVERY_SECONDS = 3600
ADVISORY_LOCK_KEY = 0x4144495850  # "ADIXP": arbitrary, constant, app-wide
# A run with a clock before this is refused (a wrong clock could make everything look old).
EARLIEST_PLAUSIBLE = datetime(2026, 10, 1, tzinfo=timezone.utc)
STARTED = utcnow()  # a fresh deploy is not "stale" before its first scheduled run


def add_months(day: date, months: int) -> date:
    """Calendar months, clamped to the month's last day (29 Feb + 12 months = 28 Feb)."""
    index = day.month - 1 + months
    year, month = day.year + index // 12, index % 12 + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def photos_expire_on(resolved_at: datetime) -> date:
    """The plant-local date from which the photos of a fault resolved at `resolved_at` are removed."""
    return add_months(as_utc(resolved_at).astimezone(PLANT_TZ).date(), RETENTION_MONTHS)


def is_expired(kvar: Kvar, now: datetime) -> bool:
    if kvar.status != StatusKvaraEnum.rijeseno or kvar.datum_rjesavanja is None:
        return False
    return photos_expire_on(kvar.datum_rjesavanja) <= now.astimezone(PLANT_TZ).date()


@dataclass
class RunResult:
    mode: str
    status: str = "ok"
    faults: int = 0  # faults with expired photos found
    photos: int = 0  # photos on those faults
    deleted: int = 0
    limit_reached: bool = False
    message: str = ""
    fault_ids: list = field(default_factory=list)


def _acquire_lock():
    """A session-level advisory lock on its own connection (a Session may swap connections on commit).

    Returns the connection holding the lock, True where locks are not needed (SQLite), or None if
    another runner holds it.
    """
    if engine.dialect.name != "postgresql":
        return True
    connection = engine.connect().execution_options(isolation_level="AUTOCOMMIT")
    if connection.execute(text("SELECT pg_try_advisory_lock(:key)"), {"key": ADVISORY_LOCK_KEY}).scalar():
        return connection
    connection.close()
    return None


def _release_lock(lock) -> None:
    if lock is True or lock is None:
        return
    try:
        lock.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": ADVISORY_LOCK_KEY})
    finally:
        lock.close()


def _candidates(db: Session, now: datetime) -> list[tuple[int, int]]:
    """(fault id, photo count) for resolved faults that have photos and are past the rule, oldest first."""
    # A coarse SQL bound (11 months) keeps the scan small; the exact calendar rule is applied in Python.
    rough = now - timedelta(days=330)
    rows = (
        db.query(Kvar, func.count(KvarPrilog.id))
        .join(KvarPrilog, KvarPrilog.kvar_id == Kvar.id)
        .filter(Kvar.status == StatusKvaraEnum.rijeseno, Kvar.datum_rjesavanja.isnot(None), Kvar.datum_rjesavanja < rough)
        .group_by(Kvar.id)
        .order_by(Kvar.datum_rjesavanja, Kvar.id)
        .all()
    )
    return [(kvar.id, count) for kvar, count in rows if is_expired(kvar, now)]


def _delete_fault_photos(db: Session, kvar_id: int, now: datetime) -> int:
    """Remove one fault's photos in one transaction, after re-checking the rule under a row lock."""
    kvar = db.query(Kvar).filter(Kvar.id == kvar_id).with_for_update().first()
    if kvar is None or not is_expired(kvar, now):
        db.rollback()  # reopened or deleted meanwhile: keep everything
        return 0
    photos = db.query(KvarPrilog.id).filter(KvarPrilog.kvar_id == kvar_id).all()
    ids = [photo_id for (photo_id,) in photos]
    if not ids:
        db.rollback()
        return 0
    db.query(KvarPrilog).filter(KvarPrilog.id.in_(ids)).delete(synchronize_session=False)
    db.add(KvarDogadjaj(
        kvar_id=kvar_id,
        korisnik_id=None,
        tip="retencija",
        naslov=f"Fotografije uklonjene prema pravilu čuvanja ({RETENTION_MONTHS} mj.)",
        podaci={
            "count": len(ids),
            "prilog_ids": ids,
            "rijeseno": as_utc(kvar.datum_rjesavanja).isoformat(),
            "pravilo_mjeseci": RETENTION_MONTHS,
        },
        interno=False,
    ))
    db.commit()
    publish_fault(kvar, "photo")
    return len(ids)


def run_photo_retention(now: datetime | None = None, mode: str | None = None, limit: int | None = None) -> RunResult:
    """One run. Records itself in `zadaci_izvrsenja` and never raises (the error is recorded)."""
    now = now or utcnow()
    mode = (mode or settings.PHOTO_RETENTION_MODE or "dry-run").strip().lower()
    limit = settings.PHOTO_RETENTION_MAX_PER_RUN if limit is None else limit
    result = RunResult(mode=mode)
    db = SessionLocal()
    record = ZadatakIzvrsenje(zadatak=JOB, nacin=mode, status="ok", pokrenut=now)
    lock = None
    try:
        if mode not in MODES:
            raise ValueError(f"Unknown PHOTO_RETENTION_MODE {mode!r}; expected one of {MODES}")
        if now < EARLIEST_PLAUSIBLE:
            raise ValueError(f"Clock looks wrong ({now.isoformat()}); refusing to run")
        if limit < 1:
            raise ValueError("PHOTO_RETENTION_MAX_PER_RUN must be at least 1")
        if mode == "off":
            result.status, result.message = "preskoceno", "Isključeno (PHOTO_RETENTION_MODE=off)"
            return result
        lock = _acquire_lock()
        if lock is None:
            result.status, result.message = "preskoceno", "Drugi proces već izvodi zadatak"
            return result

        candidates = _candidates(db, now)
        db.rollback()  # end the read transaction before per-fault transactions
        result.faults = len(candidates)
        result.photos = sum(count for _, count in candidates)
        if mode == "dry-run":
            result.fault_ids = [kvar_id for kvar_id, _ in candidates]
            result.message = f"Probni rad: za brisanje {result.photos} fotografija na {result.faults} kvarova"
            return result

        for kvar_id, count in candidates:
            if result.deleted + count > limit:
                result.limit_reached = True
                break
            removed = _delete_fault_photos(db, kvar_id, now)
            if removed:
                result.deleted += removed
                result.fault_ids.append(kvar_id)
        result.message = f"Obrisano {result.deleted} fotografija na {len(result.fault_ids)} kvarova" + (
            f"; dosegnuto ograničenje od {limit}, ostatak sljedeći put" if result.limit_reached else ""
        )
        return result
    except Exception as error:  # recorded and retried on the next check; never takes the app down
        db.rollback()
        result.status = "greska"
        result.message = f"{type(error).__name__}: {error}"[:1000]
        logger.exception("Photo retention run failed")
        return result
    finally:
        try:
            _release_lock(lock)
            record.status = result.status
            record.zavrsen = utcnow()
            record.kvarova = result.faults
            record.fotografija = result.photos
            record.obrisano = result.deleted
            record.poruka = result.message
            db.add(record)
            db.commit()
        except Exception:
            logger.exception("Could not record the photo retention run")
            db.rollback()
        finally:
            db.close()
        log = logger.error if result.status == "greska" else logger.info
        log("Photo retention (%s): %s", mode, result.message)
        if result.status == "greska":
            _alert_if_repeated()


def recent_runs(db: Session, count: int = 10) -> list[ZadatakIzvrsenje]:
    return (
        db.query(ZadatakIzvrsenje)
        .filter(ZadatakIzvrsenje.zadatak == JOB)
        .order_by(ZadatakIzvrsenje.pokrenut.desc(), ZadatakIzvrsenje.id.desc())
        .limit(count)
        .all()
    )


def consecutive_failures(db: Session) -> int:
    failures = 0
    for run in recent_runs(db, FAILURES_BEFORE_ALERT + 5):
        if run.status == "preskoceno":
            continue
        if run.status != "greska":
            break
        failures += 1
    return failures


def health(db: Session, now: datetime | None = None) -> tuple[bool, dict]:
    """Job health for monitoring: no personal data. Unhealthy after repeated failures or no run for 48 h."""
    now = now or utcnow()
    mode = (settings.PHOTO_RETENTION_MODE or "dry-run").strip().lower()
    if mode == "off":
        return True, {"photo_retention": "off"}
    failures = consecutive_failures(db)
    last_ok = (
        db.query(func.max(ZadatakIzvrsenje.pokrenut))
        .filter(ZadatakIzvrsenje.zadatak == JOB, ZadatakIzvrsenje.status == "ok")
        .scalar()
    )
    if failures >= FAILURES_BEFORE_ALERT:
        return False, {"photo_retention": "failing", "failures": failures}
    if last_ok is None:
        if now - STARTED > STALE_AFTER:
            return False, {"photo_retention": "stale", "last_ok": None}
        return True, {"photo_retention": "pending", "mode": mode}
    if now - as_utc(last_ok) > STALE_AFTER:
        return False, {"photo_retention": "stale", "last_ok": as_utc(last_ok).isoformat()}
    return True, {"photo_retention": "ok", "mode": mode, "last_ok": as_utc(last_ok).isoformat()}


def _alert_if_repeated() -> None:
    """On exactly the Nth failure in a row: one error log line and one webhook call (not on every retry)."""
    db = SessionLocal()
    try:
        failures = consecutive_failures(db)
    finally:
        db.close()
    if failures != FAILURES_BEFORE_ALERT:
        return
    message = f"AdixPaper: brisanje starih fotografija nije uspjelo {failures} puta zaredom. Provjerite zapise (logs)."
    logger.error("Photo retention failed %s times in a row", failures)
    if settings.ALERT_WEBHOOK_URL:
        try:
            body = json.dumps({"content": message, "text": message}).encode()
            request = urllib.request.Request(settings.ALERT_WEBHOOK_URL, data=body, headers={"Content-Type": "application/json"})
            urllib.request.urlopen(request, timeout=10).close()
        except Exception:
            logger.exception("Alert webhook failed")


def is_due(now: datetime, last_attempt: datetime | None, hour: int | None = None) -> bool:
    """Due once per plant-local day, after `hour`; a failed or skipped attempt is retried on the next check."""
    hour = settings.PHOTO_RETENTION_HOUR if hour is None else hour
    local = now.astimezone(PLANT_TZ)
    if local.hour < hour:
        return False
    if last_attempt is None:
        return True
    return as_utc(last_attempt).astimezone(PLANT_TZ).date() < local.date()


class RetentionScheduler:
    """A daemon thread in the app process: hourly check, one run per plant-local day.

    No extra service or cron (no cost); the advisory lock keeps it single-run if more than one
    replica is ever started. Successful runs mark the day done; failures and skips are retried
    on the next hourly check.
    """

    def __init__(self, interval: float = CHECK_EVERY_SECONDS):
        self.interval = interval
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def _last_success(self) -> datetime | None:
        db = SessionLocal()
        try:
            return (
                db.query(func.max(ZadatakIzvrsenje.pokrenut))
                .filter(ZadatakIzvrsenje.zadatak == JOB, ZadatakIzvrsenje.status == "ok")
                .scalar()
            )
        finally:
            db.close()

    def tick(self, now: datetime | None = None) -> RunResult | None:
        now = now or utcnow()
        if (settings.PHOTO_RETENTION_MODE or "").strip().lower() == "off":
            return None
        if not is_due(now, self._last_success()):
            return None
        return run_photo_retention(now=now)

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                self.tick()
            except Exception:
                logger.exception("Photo retention scheduler check failed")
            self._stop.wait(self.interval)

    def start(self) -> None:
        if self._thread is None:
            self._thread = threading.Thread(target=self._loop, name="photo-retention", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=10)
