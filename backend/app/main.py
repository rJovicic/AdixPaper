from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .routers import auth, korisnici, oprema, dashboard, kvarovi, notifikacije

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Adix Paper - Sustav za upravljanje kvarovima",
    version="2.0.0",
    description="API za ticket/task sustav održavanja strojeva"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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
