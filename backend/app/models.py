from sqlalchemy import Column, Integer, String, Text, Date, DateTime, Numeric, ForeignKey, Boolean, Enum, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from .database import Base


class RolaEnum(str, enum.Enum):
    voditelj = "voditelj"
    radnik = "radnik"
    admin = "admin"


class StatusOpremaEnum(str, enum.Enum):
    aktivno = "Aktivno"
    neispravno = "Neispravno"
    na_servisu = "Na servisu"
    raspisano = "Raspisano"


class TvrtkaEnum(str, enum.Enum):
    cupup = "Cupup d.o.o"
    delt = "Delt papir d.o.o"


class PrioritetEnum(str, enum.Enum):
    hitno = "Hitno"
    normalno = "Normalno"
    nisko = "Nisko"


class StatusKvaraEnum(str, enum.Enum):
    novo = "Novo"
    u_rjesavanju = "U rješavanju"
    na_cekanju = "Na čekanju"
    rijeseno = "Riješeno"


# SLA sati po prioritetu
SLA_SATI = {
    "Hitno": 2,
    "Normalno": 8,
    "Nisko": 48,
}


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

    prijavljeni_kvarovi = relationship("Kvar", foreign_keys="Kvar.prijavio_id", back_populates="prijavio")
    rijesavani_kvarovi = relationship("Kvar", foreign_keys="Kvar.voditelj_id", back_populates="voditelj")
    kvar_dogadjaji = relationship("KvarDogadjaj", back_populates="korisnik")
    push_pretplate = relationship("PushPretplata", back_populates="korisnik")


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

    kvarovi = relationship("Kvar", back_populates="oprema")


class Kvar(Base):
    __tablename__ = "kvarovi"

    id = Column(Integer, primary_key=True, index=True)
    oprema_id = Column(Integer, ForeignKey("oprema.id"), nullable=False)
    prijavio_id = Column(Integer, ForeignKey("korisnici.id"), nullable=False)
    voditelj_id = Column(Integer, ForeignKey("korisnici.id"), nullable=True)

    naslov = Column(String(200), nullable=False)
    opis = Column(Text, nullable=True)
    foto_url = Column(String(500), nullable=True)
    prioritet = Column(Enum(PrioritetEnum), default=PrioritetEnum.normalno, nullable=False)
    status = Column(Enum(StatusKvaraEnum), default=StatusKvaraEnum.novo, nullable=False)

    sto_je_uradjeno = Column(Text, nullable=True)
    materijal = Column(Text, nullable=True)
    troskovi = Column(Numeric(10, 2), default=0)
    trajanje_min = Column(Integer, default=0)
    napomene_voditelja = Column(Text, nullable=True)

    datum_prijave = Column(DateTime(timezone=True), server_default=func.now())
    datum_pocetka = Column(DateTime(timezone=True), nullable=True)
    datum_rjesavanja = Column(DateTime(timezone=True), nullable=True)

    oprema = relationship("Oprema", back_populates="kvarovi")
    prijavio = relationship("Korisnik", foreign_keys=[prijavio_id], back_populates="prijavljeni_kvarovi")
    voditelj = relationship("Korisnik", foreign_keys=[voditelj_id], back_populates="rijesavani_kvarovi")
    dogadjaji = relationship("KvarDogadjaj", back_populates="kvar", cascade="all, delete-orphan", order_by="KvarDogadjaj.kreiran")


class KvarDogadjaj(Base):
    __tablename__ = "kvar_dogadjaji"

    id = Column(Integer, primary_key=True, index=True)
    kvar_id = Column(Integer, ForeignKey("kvarovi.id"), nullable=False, index=True)
    korisnik_id = Column(Integer, ForeignKey("korisnici.id"), nullable=True)
    tip = Column(String(40), nullable=False, index=True)
    naslov = Column(String(200), nullable=False)
    opis = Column(Text, nullable=True)
    podaci = Column(JSON, nullable=True)
    interno = Column(Boolean, default=False, nullable=False)
    kreiran = Column(DateTime(timezone=True), server_default=func.now())

    kvar = relationship("Kvar", back_populates="dogadjaji")
    korisnik = relationship("Korisnik", back_populates="kvar_dogadjaji")


class PushPretplata(Base):
    __tablename__ = "push_pretplate"

    id = Column(Integer, primary_key=True, index=True)
    korisnik_id = Column(Integer, ForeignKey("korisnici.id"), nullable=False)
    endpoint = Column(Text, nullable=False, unique=True)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)
    kreiran = Column(DateTime(timezone=True), server_default=func.now())

    korisnik = relationship("Korisnik", back_populates="push_pretplate")
