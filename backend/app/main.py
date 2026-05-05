from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, inspect, text
from decimal import Decimal, InvalidOperation
from pathlib import Path
import csv
from .auth import get_password_hash
from .config import settings
from .database import engine, Base, SessionLocal
from .models import Korisnik, RolaEnum, Dobavljac, RezervniDio
from .routers import auth, korisnici, oprema, dashboard, kvarovi, notifikacije, rezervni_dijelovi

Base.metadata.create_all(bind=engine)


def ensure_additive_schema():
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    kvarovi_columns = {column["name"] for column in inspector.get_columns("kvarovi")} if "kvarovi" in table_names else set()
    dijelovi_columns = {column["name"] for column in inspector.get_columns("rezervni_dijelovi")} if "rezervni_dijelovi" in table_names else set()
    with engine.begin() as connection:
        if "komponenta_id" not in kvarovi_columns:
            connection.execute(text("ALTER TABLE kvarovi ADD COLUMN komponenta_id INTEGER"))
        if dijelovi_columns and "zaliha" not in dijelovi_columns:
            connection.execute(text("ALTER TABLE rezervni_dijelovi ADD COLUMN zaliha NUMERIC(10, 2)"))


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


def _decimal_or_none(value: str):
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
    if not settings.AUTO_SEED_SPARE_PARTS:
        return

    seed_file = Path(__file__).resolve().parent / "seed_data" / "spareparts.csv"
    if not seed_file.exists():
        return

    db = SessionLocal()
    try:
        existing_parts = db.query(func.count(RezervniDio.id)).scalar() or 0
        if existing_parts > 0:
            return

        created = 0
        with seed_file.open("r", encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                supplier_name = (row.get("supplier") or "").strip()
                part_name = (row.get("part_name") or "").strip()
                if not supplier_name or not part_name:
                    continue

                supplier = db.query(Dobavljac).filter(func.lower(Dobavljac.naziv) == supplier_name.lower()).first()
                if not supplier:
                    supplier = Dobavljac(
                        naziv=supplier_name,
                        oznaka=(row.get("supplier_code") or "").strip() or None,
                        aktivan=True,
                    )
                    db.add(supplier)
                    db.flush()

                part_code = (row.get("part_code") or "").strip() or None
                query = db.query(RezervniDio).filter(RezervniDio.dobavljac_id == supplier.id)
                part = query.filter(RezervniDio.sifra == part_code).first() if part_code else None
                if not part:
                    part = query.filter(func.lower(RezervniDio.naziv) == part_name.lower()).first()

                if part:
                    continue
                else:
                    part = RezervniDio(dobavljac_id=supplier.id)
                    db.add(part)
                    created += 1

                part.sifra = part_code
                part.naziv = part_name
                part.jedinica = (row.get("unit") or "kom").strip() or "kom"
                part.zaliha = _decimal_or_none(row.get("stock"))
                part.cijena = _decimal_or_none(row.get("price"))
                part.aktivan = True

        db.commit()
        if created:
            print(f"Seed spare parts completed: created={created}")
    except Exception as exc:
        db.rollback()
        print(f"Seed spare parts skipped due to error: {exc}")
    finally:
        db.close()


def reset_user_password_from_env():
    username = settings.RESET_USERNAME.strip()
    password = settings.RESET_PASSWORD
    if not username or not password:
        return

    db = SessionLocal()
    try:
        user = db.query(Korisnik).filter(func.lower(Korisnik.username) == username.lower()).first()
        if not user:
            print(f"Password reset skipped: user not found ({username})")
            return
        user.hashed_password = get_password_hash(password)
        user.aktivan = True
        db.commit()
        print(f"Password reset applied for {user.username}")
    finally:
        db.close()


ensure_additive_schema()
Base.metadata.create_all(bind=engine)
seed_initial_suppliers()
seed_spare_parts()

def seed_initial_admin():
    if not settings.ADMIN_USERNAME or not settings.ADMIN_PASSWORD:
        return

    username = settings.ADMIN_USERNAME.strip()
    if not username:
        return

    db = SessionLocal()
    try:
        user = db.query(Korisnik).filter(func.lower(Korisnik.username) == username.lower()).first()
        existing_admin = db.query(Korisnik).filter(Korisnik.rola == RolaEnum.admin).first()
        if existing_admin and (user is None or user.id != existing_admin.id):
            if not settings.ADMIN_RESET_PASSWORD:
                return

            user = existing_admin

        if user is None:
            user = Korisnik(username=username)
            db.add(user)
        else:
            user.username = username

        user.ime = settings.ADMIN_IME
        user.prezime = settings.ADMIN_PREZIME
        user.email = settings.ADMIN_EMAIL or None
        user.telefon = settings.ADMIN_TELEFON or None
        user.odjel = settings.ADMIN_ODJEL or None
        if settings.ADMIN_RESET_PASSWORD or not user.hashed_password:
            user.hashed_password = get_password_hash(settings.ADMIN_PASSWORD)
        user.rola = RolaEnum.admin
        user.aktivan = True
        db.commit()
    finally:
        db.close()

seed_initial_admin()
reset_user_password_from_env()

cors_origins = ["*"] if settings.CORS_ORIGINS.strip() == "*" else [
    origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()
]

app = FastAPI(
    title="Adix Paper - Sustav za upravljanje kvarovima",
    version="2.0.0",
    description="API za ticket/task sustav održavanja strojeva"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=settings.CORS_ORIGINS.strip() != "*",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(korisnici.router)
app.include_router(oprema.router)
app.include_router(kvarovi.router)
app.include_router(dashboard.router)
app.include_router(notifikacije.router)
app.include_router(rezervni_dijelovi.router)

@app.get("/")
def root():
    return {"message": "Adix Paper API v2.0", "status": "online"}

@app.get("/health")
def health():
    return {"status": "ok"}
