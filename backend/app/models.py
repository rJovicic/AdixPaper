from sqlalchemy import Column, Integer, String, Text, Date, DateTime, Numeric, ForeignKey, Boolean, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from .database import Base


class RolaEnum(str, enum.Enum):
    admin = "admin"
    radnik = "radnik"


class StatusOpremaEnum(str, enum.Enum):
    aktivno = "Aktivno"
    neispravno = "Neispravno"
    na_servisu = "Na servisu"
    raspisano = "Raspisano"


class StatusOdrzavanjaEnum(str, enum.Enum):
    zavrseno = "Završeno"
    u_tijeku = "U tijeku"
    planirano = "Planirano"


class TvrtkaEnum(str, enum.Enum):
    cupup = "Cupup d.o.o"
    delt = "Delt papir d.o.o"


class Korisnik(Base):
    __tablename__ = "korisnici"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    ime = Column(String(100), nullable=False)
    prezime = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=True)
    telefon = Column(String(20), nullable=True)
    odjel = Column(String(100), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    rola = Column(Enum(RolaEnum), default=RolaEnum.radnik, nullable=False)
    aktivan = Column(Boolean, default=True)
    kreiran = Column(DateTime(timezone=True), server_default=func.now())
    zadnja_prijava = Column(DateTime(timezone=True), nullable=True)



class Oprema(Base):
    __tablename__ = "oprema"

    id = Column(Integer, primary_key=True, index=True)
    naziv = Column(String(200), nullable=False, index=True)
    tip = Column(String(100), nullable=False)
    tvrtka = Column(Enum(TvrtkaEnum), nullable=True)
    proizvodac = Column(String(100), nullable=True)
    model = Column(String(100), nullable=True)
    serijski_broj = Column(String(100), unique=True, nullable=True)
    lokacija = Column(String(150), nullable=True)
    datum_kupnje = Column(Date, nullable=True)
    status = Column(Enum(StatusOpremaEnum), default=StatusOpremaEnum.aktivno)
    napomene = Column(Text, nullable=True)
    qr_kod = Column(String(200), nullable=True)
    kreiran = Column(DateTime(timezone=True), server_default=func.now())

    odrzavanja = relationship("Odrzavanje", back_populates="oprema")


class Odrzavanje(Base):
    __tablename__ = "odrzavanje"

    id = Column(Integer, primary_key=True, index=True)
    oprema_id = Column(Integer, ForeignKey("oprema.id"), nullable=False)
    izvodioc_id = Column(Integer, ForeignKey("korisnici.id"), nullable=True)
    datum = Column(Date, nullable=False)
    vrsta_odrzavanja = Column(String(100), nullable=False)
    opis = Column(Text, nullable=True)
    materijal = Column(Text, nullable=True)
    troskovi = Column(Numeric(10, 2), default=0)
    trajanje = Column(Integer, default=0)
    status = Column(Enum(StatusOdrzavanjaEnum), default=StatusOdrzavanjaEnum.zavrseno)
    napomene = Column(Text, nullable=True)
    foto_url = Column(String(500), nullable=True)
    kreiran = Column(DateTime(timezone=True), server_default=func.now())
    kreirao_id = Column(Integer, ForeignKey("korisnici.id"), nullable=True)

    oprema = relationship("Oprema", back_populates="odrzavanja")
    izvodioc = relationship("Korisnik", foreign_keys=[izvodioc_id])
