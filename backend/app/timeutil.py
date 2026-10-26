"""Time helpers. Timestamps are stored in UTC; reporting periods follow the plant's local calendar."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

PLANT_TZ = ZoneInfo("Europe/Zagreb")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    """Normalise a DB value: naive values (SQLite) are treated as UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def local_day_start(now: datetime | None = None) -> datetime:
    local = (now or utcnow()).astimezone(PLANT_TZ)
    return local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)


def local_month_start(now: datetime | None = None) -> datetime:
    local = (now or utcnow()).astimezone(PLANT_TZ)
    return local.replace(day=1, hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)


def local_year_start(now: datetime | None = None) -> datetime:
    local = (now or utcnow()).astimezone(PLANT_TZ)
    return local.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)


def local_month_number(value: datetime) -> int:
    return as_utc(value).astimezone(PLANT_TZ).month


__all__ = ["PLANT_TZ", "utcnow", "as_utc", "local_day_start", "local_month_start", "local_year_start", "local_month_number", "local_naive"]


def local_naive(value: datetime | None) -> datetime | None:
    """Plant-local wall-clock time without tzinfo, for spreadsheets and printed reports."""
    if value is None:
        return None
    return as_utc(value).astimezone(PLANT_TZ).replace(tzinfo=None)
