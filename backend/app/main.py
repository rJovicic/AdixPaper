from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .auth import get_password_hash
from .config import settings
from .database import engine, Base, SessionLocal
from .models import Korisnik, RolaEnum
from .routers import auth, korisnici, oprema, dashboard, kvarovi, notifikacije

Base.metadata.create_all(bind=engine)

def seed_initial_admin():
    if not settings.ADMIN_USERNAME or not settings.ADMIN_PASSWORD:
        return

    db = SessionLocal()
    try:
        existing_admin = db.query(Korisnik).filter(Korisnik.rola == RolaEnum.admin).first()
        if existing_admin:
            return

        user = db.query(Korisnik).filter(Korisnik.username == settings.ADMIN_USERNAME).first()
        if user is None:
            user = Korisnik(username=settings.ADMIN_USERNAME)
            db.add(user)

        user.ime = settings.ADMIN_IME
        user.prezime = settings.ADMIN_PREZIME
        user.email = settings.ADMIN_EMAIL or None
        user.telefon = settings.ADMIN_TELEFON or None
        user.odjel = settings.ADMIN_ODJEL or None
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

@app.get("/")
def root():
    return {"message": "Adix Paper API v2.0", "status": "online"}

@app.get("/health")
def health():
    return {"status": "ok"}
