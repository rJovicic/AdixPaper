from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, inspect, text
from .auth import get_password_hash
from .config import settings
from .database import engine, Base, SessionLocal
from .models import Korisnik, RolaEnum, Dobavljac
from .routers import auth, korisnici, oprema, dashboard, kvarovi, notifikacije, rezervni_dijelovi

Base.metadata.create_all(bind=engine)


def ensure_additive_schema():
    inspector = inspect(engine)
    if "kvarovi" not in inspector.get_table_names():
        return

    kvarovi_columns = {column["name"] for column in inspector.get_columns("kvarovi")}
    dijelovi_columns = {column["name"] for column in inspector.get_columns("rezervni_dijelovi")} if "rezervni_dijelovi" in inspector.get_table_names() else set()
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


ensure_additive_schema()
Base.metadata.create_all(bind=engine)
seed_initial_suppliers()

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
