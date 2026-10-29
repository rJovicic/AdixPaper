"""Idempotent database initialisation that runs once on application startup."""
import csv
import logging
import time
from decimal import Decimal, InvalidOperation
from pathlib import Path

from sqlalchemy import func, inspect, text
from sqlalchemy.exc import OperationalError

from .auth import set_password
from .config import settings
from .database import Base, SessionLocal, engine
from .models import Dobavljac, Korisnik, RezervniDio, RolaEnum, nova_qr_oznaka

logger = logging.getLogger("adixpaper")

SEED_FILE = Path(__file__).resolve().parent / "seed_data" / "spareparts.csv"


def wait_for_database(timeout: float | None = None, sleep=time.sleep, clock=time.monotonic) -> int:
    """Block until the database answers `SELECT 1`, retrying with backoff (1 s doubling to 10 s).

    A redeploy can start the app before Postgres accepts connections or before its private
    hostname resolves (seen on Railway on 2026-10-28). Failing at once spends one of the
    platform's limited restarts; waiting here rides out the gap. Returns the number of
    attempts. Raises the last error once `timeout` seconds have passed.
    """
    timeout = settings.DB_STARTUP_TIMEOUT_SECONDS if timeout is None else timeout
    deadline = clock() + timeout
    delay = 1.0
    attempt = 0
    while True:
        attempt += 1
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            if attempt > 1:
                logger.info("Database reachable after %s attempts", attempt)
            return attempt
        except OperationalError as error:
            remaining = deadline - clock()
            if remaining <= 0:
                logger.error("Database still unreachable after %s attempts; giving up", attempt)
                raise
            # The first line only: the full message can include the host but never the password.
            reason = str(error.orig if getattr(error, "orig", None) else error).splitlines()[0]
            logger.warning("Database not reachable yet (attempt %s): %s; retrying in %.0f s", attempt, reason, min(delay, remaining))
            sleep(min(delay, remaining))
            delay = min(delay * 2, 10.0)


def ensure_additive_schema():
    """Add columns introduced after the first release to databases created before them."""
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    kvarovi_columns = {c["name"] for c in inspector.get_columns("kvarovi")} if "kvarovi" in table_names else set()
    dijelovi_info = {c["name"]: c for c in inspector.get_columns("rezervni_dijelovi")} if "rezervni_dijelovi" in table_names else {}
    dijelovi_columns = set(dijelovi_info)
    korisnici_columns = {c["name"] for c in inspector.get_columns("korisnici")} if "korisnici" in table_names else set()
    usage_columns = {c["name"] for c in inspector.get_columns("kvar_rezervni_dijelovi")} if "kvar_rezervni_dijelovi" in table_names else set()
    oprema_info = {c["name"]: c for c in inspector.get_columns("oprema")} if "oprema" in table_names else {}
    komponente_columns = {c["name"] for c in inspector.get_columns("komponente_opreme")} if "komponente_opreme" in table_names else set()
    postgres = engine.dialect.name == "postgresql"
    timestamp = "TIMESTAMP WITH TIME ZONE" if engine.dialect.name == "postgresql" else "DATETIME"
    with engine.begin() as connection:
        if kvarovi_columns and "komponenta_id" not in kvarovi_columns:
            connection.execute(text("ALTER TABLE kvarovi ADD COLUMN komponenta_id INTEGER"))
        # 2026-10-27: waiting reason, optimistic-concurrency version, last visible change.
        if kvarovi_columns and "razlog_cekanja" not in kvarovi_columns:
            connection.execute(text("ALTER TABLE kvarovi ADD COLUMN razlog_cekanja VARCHAR(30)"))
        if kvarovi_columns and "cekanje_od" not in kvarovi_columns:
            connection.execute(text(f"ALTER TABLE kvarovi ADD COLUMN cekanje_od {timestamp}"))
        if kvarovi_columns and "verzija" not in kvarovi_columns:
            connection.execute(text("ALTER TABLE kvarovi ADD COLUMN verzija INTEGER NOT NULL DEFAULT 1"))
        if kvarovi_columns and "azurirano" not in kvarovi_columns:
            connection.execute(text(f"ALTER TABLE kvarovi ADD COLUMN azurirano {timestamp}"))
        if kvarovi_columns and "klijent_kljuc" not in kvarovi_columns:
            connection.execute(text("ALTER TABLE kvarovi ADD COLUMN klijent_kljuc VARCHAR(64)"))
        # 2026-10-29: first response (the response window now ends at it, not at resolution).
        # Filled once, in the same transaction that adds the column, from the record itself:
        # the first status change away from "Novo" in the timeline, else the start of work or the
        # resolution for faults that left "Novo" before the timeline recorded it. Faults still
        # new with no such change stay NULL (waiting). Only the new column is written.
        if kvarovi_columns and "datum_odziva" not in kvarovi_columns:
            connection.execute(text(f"ALTER TABLE kvarovi ADD COLUMN datum_odziva {timestamp}"))
            if "kvar_dogadjaji" in table_names:
                old_status = "e.podaci->>'old'" if postgres else "json_extract(e.podaci, '$.old')"
                connection.execute(text(f"""
                    UPDATE kvarovi SET datum_odziva = COALESCE(
                        (SELECT MIN(e.kreiran) FROM kvar_dogadjaji e
                         WHERE e.kvar_id = kvarovi.id AND e.tip = 'status' AND {old_status} = 'Novo'),
                        CASE WHEN status <> 'novo' THEN COALESCE(datum_pocetka, datum_rjesavanja) END
                    )
                """))
        # 2026-10-29: unit price at the time of use, so later catalogue edits do not rewrite past
        # costs. Existing rows get the catalogue price as it stands at the upgrade, flagged as
        # recorded later (cijena_naknadno) because the price on the day of use is not known.
        if usage_columns and "jedinicna_cijena" not in usage_columns:
            connection.execute(text("ALTER TABLE kvar_rezervni_dijelovi ADD COLUMN jedinicna_cijena NUMERIC(10, 2)"))
            connection.execute(text("ALTER TABLE kvar_rezervni_dijelovi ADD COLUMN cijena_naknadno BOOLEAN NOT NULL DEFAULT FALSE"))
            connection.execute(text("""
                UPDATE kvar_rezervni_dijelovi SET
                    jedinicna_cijena = (SELECT r.cijena FROM rezervni_dijelovi r WHERE r.id = kvar_rezervni_dijelovi.rezervni_dio_id),
                    cijena_naknadno = TRUE
            """))
        if korisnici_columns and "sesije_od" not in korisnici_columns:
            connection.execute(text(f"ALTER TABLE korisnici ADD COLUMN sesije_od {timestamp}"))
        if dijelovi_columns and "zaliha" not in dijelovi_columns:
            connection.execute(text("ALTER TABLE rezervni_dijelovi ADD COLUMN zaliha NUMERIC(10, 2)"))
        # Supplier became optional on spare parts (2026-10-27). SQLite cannot alter
        # columns; databases created by create_all already have it nullable.
        supplier = dijelovi_info.get("dobavljac_id")
        if supplier and not supplier["nullable"] and engine.dialect.name == "postgresql":
            connection.execute(text("ALTER TABLE rezervni_dijelovi ALTER COLUMN dobavljac_id DROP NOT NULL"))
        # 2026-10-30: machine → component hierarchy. Identifiers (inventory and serial numbers) are
        # optional; every machine and component gets an opaque QR identifier (qr_oznaka). Additive only.
        if oprema_info:
            for column, ddl in (
                ("inventurni_broj", "VARCHAR(100)"),
                ("qr_oznaka", "VARCHAR(32)"),
                ("azurirano", timestamp),
            ):
                if column not in oprema_info:
                    connection.execute(text(f"ALTER TABLE oprema ADD COLUMN {column} {ddl}"))
            # The type stopped being required (a production line has no single "type"); SQLite tables
            # from create_all already allow NULL.
            if postgres and not oprema_info["tip"]["nullable"]:
                connection.execute(text("ALTER TABLE oprema ALTER COLUMN tip DROP NOT NULL"))
        if komponente_columns:
            for column, ddl in (
                ("proizvodac", "VARCHAR(100)"),
                ("model", "VARCHAR(100)"),
                ("inventurni_broj", "VARCHAR(100)"),
                ("serijski_broj", "VARCHAR(100)"),
                ("qr_oznaka", "VARCHAR(32)"),
                ("azurirano", timestamp),
            ):
                if column not in komponente_columns:
                    connection.execute(text(f"ALTER TABLE komponente_opreme ADD COLUMN {column} {ddl}"))
        # Every machine and component without a QR identifier gets one (existing rows on the upgrade;
        # never touches one already set, so printed labels keep working).
        for table, present in (("oprema", bool(oprema_info)), ("komponente_opreme", bool(komponente_columns))):
            if not present:
                continue
            for (row_id,) in connection.execute(text(f"SELECT id FROM {table} WHERE qr_oznaka IS NULL")).all():
                connection.execute(text(f"UPDATE {table} SET qr_oznaka = :oznaka WHERE id = :id"), {"oznaka": nova_qr_oznaka(), "id": row_id})
            connection.execute(text(f"CREATE UNIQUE INDEX IF NOT EXISTS ix_{table}_qr_oznaka ON {table} (qr_oznaka)"))
            connection.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{table}_inventurni_broj ON {table} (inventurni_broj)"))
        if komponente_columns:
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_komponente_opreme_serijski_broj ON komponente_opreme (serijski_broj)"))
        # Indexes for the overview, the paged fault list and the activity feed (names match create_all).
        if kvarovi_columns:
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_kvarovi_status ON kvarovi (status)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_kvarovi_datum_prijave ON kvarovi (datum_prijave)"))
            connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_kvarovi_klijent_kljuc ON kvarovi (klijent_kljuc)"))
        if "kvar_dogadjaji" in table_names:
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_kvar_dogadjaji_kreiran ON kvar_dogadjaji (kreiran)"))


def seed_initial_suppliers():
    db = SessionLocal()
    try:
        for naziv, oznaka in [("Cupup d.o.o", "CUPUP"), ("Delt papir d.o.o", "DELT")]:
            exists = db.query(Dobavljac).filter(func.lower(Dobavljac.naziv) == naziv.lower()).first()
            if not exists:
                db.add(Dobavljac(naziv=naziv, oznaka=oznaka, aktivan=True))
        db.commit()
    finally:
        db.close()


def _decimal_or_none(value):
    if value is None:
        return None
    text_value = str(value).strip().replace(",", ".")
    if not text_value:
        return None
    try:
        return Decimal(text_value)
    except (InvalidOperation, ValueError):
        return None


def seed_spare_parts():
    """Load the spare-parts catalogue once, only into an empty table.

    The tracked file holds names and codes only. Prices and stock are commercially sensitive and
    were removed from it (2026-10-29); "price"/"stock" columns are still read if an operator loads
    a private copy with them, but they must never be committed again.
    """
    if not settings.AUTO_SEED_SPARE_PARTS or not SEED_FILE.exists():
        return

    db = SessionLocal()
    try:
        if (db.query(func.count(RezervniDio.id)).scalar() or 0) > 0:
            return

        created = 0
        suppliers = {}
        seen = set()
        with SEED_FILE.open("r", encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                supplier_name = (row.get("supplier") or "").strip()
                part_name = (row.get("part_name") or "").strip()
                if not supplier_name or not part_name:
                    continue

                supplier = suppliers.get(supplier_name.lower())
                if supplier is None:
                    supplier = db.query(Dobavljac).filter(func.lower(Dobavljac.naziv) == supplier_name.lower()).first()
                    if not supplier:
                        supplier = Dobavljac(
                            naziv=supplier_name,
                            oznaka=(row.get("supplier_code") or "").strip() or None,
                            aktivan=True,
                        )
                        db.add(supplier)
                        db.flush()
                    suppliers[supplier_name.lower()] = supplier

                part_code = (row.get("part_code") or "").strip() or None
                key = (supplier.id, part_code or part_name.lower())
                if key in seen:
                    continue
                seen.add(key)

                db.add(RezervniDio(
                    dobavljac_id=supplier.id,
                    sifra=part_code,
                    naziv=part_name,
                    jedinica=(row.get("unit") or "kom").strip() or "kom",
                    zaliha=_decimal_or_none(row.get("stock")),
                    cijena=_decimal_or_none(row.get("price")),
                    aktivan=True,
                ))
                created += 1

        db.commit()
        logger.info("Seeded spare parts: %s", created)
    except Exception:
        db.rollback()
        logger.exception("Spare parts seed skipped")
    finally:
        db.close()


def seed_initial_admin():
    """Create the first admin from ADMIN_* variables; optionally reset its password.

    Profile fields are only written on creation or an explicit reset so edits made
    in the app are not overwritten on every deploy.
    """
    username = (settings.ADMIN_USERNAME or "").strip()
    if not username or not settings.ADMIN_PASSWORD:
        return

    db = SessionLocal()
    try:
        user = db.query(Korisnik).filter(func.lower(Korisnik.username) == username.lower()).first()
        existing_admin = db.query(Korisnik).filter(Korisnik.rola == RolaEnum.admin).first()

        if user is None and existing_admin is not None:
            if not settings.ADMIN_RESET_PASSWORD:
                return
            user = existing_admin
            user.username = username

        created = user is None
        if created:
            user = Korisnik(username=username)
            db.add(user)

        if created or settings.ADMIN_RESET_PASSWORD:
            user.ime = settings.ADMIN_IME
            user.prezime = settings.ADMIN_PREZIME
            user.email = settings.ADMIN_EMAIL or None
            user.telefon = settings.ADMIN_TELEFON or None
            user.odjel = settings.ADMIN_ODJEL or None
            set_password(user, settings.ADMIN_PASSWORD)
            user.rola = RolaEnum.admin
            user.aktivan = True
            logger.info("Admin account %s: %s", "created" if created else "reset", username)
        db.commit()
    finally:
        db.close()


def reset_user_password_from_env():
    username = (settings.RESET_USERNAME or "").strip()
    password = settings.RESET_PASSWORD
    if not username or not password:
        return

    db = SessionLocal()
    try:
        user = db.query(Korisnik).filter(func.lower(Korisnik.username) == username.lower()).first()
        if not user:
            logger.warning("Password reset skipped: user not found (%s)", username)
            return
        set_password(user, password)
        user.aktivan = True
        db.commit()
        logger.info("Password reset applied for %s", user.username)
    finally:
        db.close()


def run():
    wait_for_database()
    Base.metadata.create_all(bind=engine)
    ensure_additive_schema()
    seed_initial_suppliers()
    seed_spare_parts()
    seed_initial_admin()
    reset_user_password_from_env()
