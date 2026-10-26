from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from .config import settings

db_url = settings.DATABASE_URL
# Railway and Heroku style URLs use the "postgres://" scheme, which SQLAlchemy rejects.
if db_url.startswith("postgres://"):
    db_url = "postgresql://" + db_url[len("postgres://"):]
connect_args = {"check_same_thread": False} if db_url.startswith("sqlite") else {}
engine = create_engine(db_url, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
