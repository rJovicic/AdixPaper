import logging
import os
import secrets
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("adixpaper")

# Default location of the built frontend inside the production image (see /Dockerfile).
DEFAULT_FRONTEND_DIST = Path(__file__).resolve().parent.parent / "static"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/adixpaper"
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    # Comma-separated list of extra origins allowed to call the API. The production
    # build serves frontend and API from one origin, so this is normally empty.
    CORS_ORIGINS: str = ""
    FRONTEND_DIST: str = str(DEFAULT_FRONTEND_DIST)
    # How long startup waits for the database (e.g. while Railway restarts Postgres or its
    # private hostname is not resolvable yet) before giving up and letting the platform restart us.
    DB_STARTUP_TIMEOUT_SECONDS: float = 90
    # Public origin printed into machine QR codes, e.g. https://adixpaper-production.up.railway.app.
    # Defaults to the origin the request came in on.
    PUBLIC_URL: str = ""
    VAPID_PUBLIC_KEY: str = ""
    VAPID_PRIVATE_KEY: str = ""
    VAPID_EMAIL: str = "mailto:admin@adixpaper.com"
    ADMIN_USERNAME: str = ""
    ADMIN_PASSWORD: str = ""
    ADMIN_RESET_PASSWORD: bool = False
    ADMIN_IME: str = "Admin"
    ADMIN_PREZIME: str = "Adix"
    ADMIN_EMAIL: str = ""
    ADMIN_TELEFON: str = ""
    ADMIN_ODJEL: str = "Administracija"
    AUTO_SEED_SPARE_PARTS: bool = True
    RESET_USERNAME: str = ""
    RESET_PASSWORD: str = ""


def is_production() -> bool:
    return bool(os.getenv("RAILWAY_ENVIRONMENT_NAME")) or os.getenv("APP_ENV", "").lower() == "production"


settings = Settings()

if not settings.SECRET_KEY.strip():
    if is_production():
        raise RuntimeError("SECRET_KEY must be set in production (use a long random value).")
    # Local development only: tokens are invalidated whenever the process restarts.
    settings.SECRET_KEY = secrets.token_urlsafe(48)
    logger.warning("SECRET_KEY is not set; using an ephemeral development key.")
