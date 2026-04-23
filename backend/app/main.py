from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .routers import auth, korisnici, oprema, odrzavanje, dashboard

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Adix Paper - Sustav za evidenciju održavanja",
    version="1.0.0",
    description="API za upravljanje održavanjem strojeva i opreme"
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
app.include_router(odrzavanje.router)
app.include_router(dashboard.router)

@app.get("/")
def root():
    return {"message": "Adix Paper API v1.0", "status": "online"}

@app.get("/health")
def health():
    return {"status": "ok"}
