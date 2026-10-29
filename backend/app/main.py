import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import text

from . import bootstrap, retention
from .config import settings
from .database import SessionLocal, engine
from .security import SecurityHeadersMiddleware
from .routers import auth, korisnici, oprema, dashboard, kvarovi, notifikacije, qr, rezervni_dijelovi, uzivo


@asynccontextmanager
async def lifespan(_: FastAPI):
    bootstrap.run()
    scheduler = retention.RetentionScheduler() if settings.PHOTO_RETENTION_SCHEDULER else None
    if scheduler:
        scheduler.start()
    yield
    if scheduler:
        scheduler.stop()


app = FastAPI(
    title="Adix Paper - Sustav za upravljanje kvarovima",
    version="2.1.0",
    description="API za ticket/task sustav održavanja strojeva",
    lifespan=lifespan,
)

app.add_middleware(SecurityHeadersMiddleware)

cors_origins = [origin.strip() for origin in settings.CORS_ORIGINS.split(",") if origin.strip()]
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=False,
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
app.include_router(uzivo.router)
app.include_router(qr.router)


@app.get("/health", include_in_schema=False)
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        logging.getLogger("adixpaper").exception("Health check: database unreachable")
        return JSONResponse({"status": "error", "database": "unreachable"}, status_code=503)
    return {"status": "ok"}


@app.get("/health/jobs", include_in_schema=False)
def health_jobs():
    """Background job health for an uptime check: 503 after repeated failures or no run for 48 h."""
    db = SessionLocal()
    try:
        healthy, body = retention.health(db)
    finally:
        db.close()
    return JSONResponse(body, status_code=200 if healthy else 503)


# --- Frontend (single-page app) -------------------------------------------------
# The production image places the Vite build in FRONTEND_DIST. Without it (local API
# development) only the API is served and the Vite dev server proxies /api here.
frontend_dist = Path(settings.FRONTEND_DIST).resolve()
NO_CACHE_FILES = {"index.html", "sw.js", "manifest.json"}


def _frontend_file(path: Path) -> FileResponse:
    if path.name in NO_CACHE_FILES:
        headers = {"Cache-Control": "no-cache"}
    elif path.parent.name == "assets":
        # Vite fingerprints everything under /assets, so it can be cached forever.
        headers = {"Cache-Control": "public, max-age=31536000, immutable"}
    else:
        headers = {"Cache-Control": "public, max-age=86400"}
    return FileResponse(path, headers=headers)


if (frontend_dist / "index.html").is_file():

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        candidate = (frontend_dist / full_path).resolve()
        if full_path and candidate.is_file() and candidate.is_relative_to(frontend_dist):
            return _frontend_file(candidate)
        if Path(full_path).suffix:
            # A missing asset must 404, not silently return the HTML shell.
            raise HTTPException(status_code=404, detail="Not Found")
        return _frontend_file(frontend_dist / "index.html")

else:

    @app.get("/", include_in_schema=False)
    def root():
        return {"message": "Adix Paper API", "status": "online"}
