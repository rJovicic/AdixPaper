from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/adixpaper"
    SECRET_KEY: str = "adix-paper-super-secret-key-2024"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    CORS_ORIGINS: str = "*"
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

    class Config:
        env_file = ".env"

settings = Settings()
