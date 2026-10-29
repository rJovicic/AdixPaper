"""Delete every fault from a confirmed, disposable TEST database, to start a test cycle at zero.

    python -m app.reset_test_data status
    python -m app.reset_test_data mark-disposable --confirm-database <name> [--allow-remote-host <host>]
    python -m app.reset_test_data reset --confirm-database <name> --yes-delete-all-faults [--allow-remote-host <host>]

What a reset deletes: all faults and everything that hangs off them — photos (kvar_prilozi), spare
parts used (kvar_rezervni_dijelovi), timeline/audit entries (kvar_dogadjaji). What it keeps:
users, machines, components, the parts catalogue, suppliers, push subscriptions, job history,
settings. Counts are printed; a second run deletes nothing.

Safeguards, all of which must pass (none can be switched off by configuration):
1. Never in a production environment: refused when RAILWAY_ENVIRONMENT_NAME / RAILWAY_ENVIRONMENT
   contains "prod" or APP_ENV=production, whatever the flags.
2. --confirm-database must equal the name of the database actually connected to.
3. The database must be on this machine (localhost, a socket, SQLite) or on the exact host given
   with --allow-remote-host.
4. The database must carry the disposable marker (`postavke.test_baza` = its name), written only
   by `mark-disposable` under the same checks. A production database never has it.
5. `reset` needs --yes-delete-all-faults.
"""
from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass

from sqlalchemy import func, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from .models import Kvar, KvarDogadjaj, KvarPrilog, KvarRezervniDio, Postavka

MARKER = "test_baza"
LOCAL_HOSTS = {None, "", "localhost", "127.0.0.1", "::1"}


class Refused(Exception):
    pass


@dataclass
class Target:
    dialect: str
    database: str
    host: str | None


def describe(engine: Engine) -> Target:
    url = engine.url
    database = url.database or ""
    if engine.dialect.name == "postgresql":
        with engine.connect() as connection:
            database = connection.execute(text("SELECT current_database()")).scalar()
    elif engine.dialect.name == "sqlite":
        database = os.path.basename(database or ":memory:")
    return Target(engine.dialect.name, database, url.host)


def production_environment(environ=os.environ) -> bool:
    railway = f"{environ.get('RAILWAY_ENVIRONMENT_NAME', '')} {environ.get('RAILWAY_ENVIRONMENT', '')}".lower()
    return "prod" in railway or environ.get("APP_ENV", "").lower() == "production"


def check_target(engine: Engine, confirm_database: str | None, allow_remote_host: str | None, environ=os.environ) -> Target:
    """Safeguards 1–3. Raises Refused with the reason."""
    if production_environment(environ):
        raise Refused("this process runs in a production environment (RAILWAY_ENVIRONMENT*/APP_ENV); refused")
    target = describe(engine)
    if not confirm_database or confirm_database != target.database:
        raise Refused(f"--confirm-database must name the connected database ('{target.database}')")
    if target.host not in LOCAL_HOSTS and target.host != allow_remote_host:
        raise Refused(f"the database is on remote host '{target.host}'; repeat that exact host with --allow-remote-host if it is a disposable test database")
    return target


def is_marked(db: Session, target: Target) -> bool:
    marker = db.get(Postavka, MARKER)
    return marker is not None and marker.vrijednost == target.database


def counts(db: Session) -> dict:
    return {
        "kvarovi": db.query(func.count(Kvar.id)).scalar() or 0,
        "kvar_dogadjaji": db.query(func.count(KvarDogadjaj.id)).scalar() or 0,
        "kvar_prilozi": db.query(func.count(KvarPrilog.id)).scalar() or 0,
        "kvar_rezervni_dijelovi": db.query(func.count(KvarRezervniDio.id)).scalar() or 0,
    }


def mark_disposable(engine: Engine, confirm_database: str | None, allow_remote_host: str | None = None, environ=os.environ) -> Target:
    target = check_target(engine, confirm_database, allow_remote_host, environ)
    with Session(engine) as db:
        marker = db.get(Postavka, MARKER) or Postavka(kljuc=MARKER)
        marker.vrijednost = target.database
        db.add(marker)
        db.commit()
    return target


def reset_faults(engine: Engine, confirm_database: str | None, confirmed: bool, allow_remote_host: str | None = None, environ=os.environ) -> dict:
    """Deletes all faults and their dependent rows in one transaction; returns the counts deleted."""
    target = check_target(engine, confirm_database, allow_remote_host, environ)
    if not confirmed:
        raise Refused("add --yes-delete-all-faults to delete")
    with Session(engine) as db:
        if not is_marked(db, target):
            raise Refused(f"database '{target.database}' is not marked as a disposable test database (run mark-disposable first)")
        deleted = counts(db)
        # Children first: foreign keys point at kvarovi.
        db.query(KvarPrilog).delete(synchronize_session=False)
        db.query(KvarRezervniDio).delete(synchronize_session=False)
        db.query(KvarDogadjaj).delete(synchronize_session=False)
        db.query(Kvar).delete(synchronize_session=False)
        db.commit()
    return deleted


def main(argv=None) -> int:
    from .database import engine

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", choices=["status", "mark-disposable", "reset"])
    parser.add_argument("--confirm-database")
    parser.add_argument("--allow-remote-host")
    parser.add_argument("--yes-delete-all-faults", action="store_true")
    args = parser.parse_args(argv)

    target = describe(engine)
    print(f"Target: {target.dialect} database '{target.database}' on host '{target.host or 'local'}'")
    with Session(engine) as db:
        print(f"Marked disposable: {'yes' if is_marked(db, target) else 'no'} · production environment: {'yes' if production_environment() else 'no'}")
        before = counts(db)
        oldest, newest = db.query(func.min(Kvar.datum_prijave), func.max(Kvar.datum_prijave)).one()
    print(f"Faults: {before['kvarovi']} (reported {oldest or '—'} … {newest or '—'}), timeline entries: {before['kvar_dogadjaji']}, "
          f"photos: {before['kvar_prilozi']}, parts used: {before['kvar_rezervni_dijelovi']}")
    try:
        if args.command == "mark-disposable":
            mark_disposable(engine, args.confirm_database, args.allow_remote_host)
            print("Marked as a disposable test database.")
        elif args.command == "reset":
            deleted = reset_faults(engine, args.confirm_database, args.yes_delete_all_faults, args.allow_remote_host)
            print("Deleted: " + ", ".join(f"{name} {n}" for name, n in deleted.items()))
    except Refused as reason:
        print(f"Refused: {reason}")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
