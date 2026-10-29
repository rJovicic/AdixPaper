from sqlalchemy import Column, Integer, String, Text, Date, DateTime, Numeric, ForeignKey, Boolean, Enum, JSON, LargeBinary
from sqlalchemy.orm import deferred, relationship
from sqlalchemy.sql import func
from datetime import timedelta
import enum
from .database import Base
from .timeutil import utcnow, as_utc


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


# Response windows per priority (owner, 2026-10-29): hours from the report until the FIRST RESPONSE,
# i.e. until a lead or admin first moves the fault out of "Novo" (takes it, puts it on hold or
# resolves it) — see Kvar.datum_odziva. Time to resolution is a separate metric with no target.
SLA_SATI = {
    "Hitno": 2,
    "Normalno": 8,
    "Nisko": 48,
}

# Why a fault is on hold. Stored as these codes; translated for display only.
RAZLOZI_CEKANJA = ("dijelovi", "vanjski_servis", "odobrenje", "proizvodnja", "ostalo")

# A fault on hold for longer than this needs someone to chase it.
CEKANJE_DUGO_SATI = 24

# Reasons a fault needs attention, most pressing first. See Kvar.razlozi_paznje.
RAZLOZI_PAZNJE = ("kasni", "uskoro", "hitno", "nedodijeljen", "ceka_dugo")


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
    # Sessions (tokens) issued before this moment are rejected; set when the password changes.
    sesije_od = Column(DateTime(timezone=True), nullable=True)

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
    komponente = relationship("KomponentaOpreme", back_populates="oprema", cascade="all, delete-orphan")


class KomponentaOpreme(Base):
    __tablename__ = "komponente_opreme"

    id = Column(Integer, primary_key=True, index=True)
    oprema_id = Column(Integer, ForeignKey("oprema.id"), nullable=False, index=True)
    naziv = Column(String(150), nullable=False, index=True)
    opis = Column(Text, nullable=True)
    aktivna = Column(Boolean, default=True, nullable=False)
    kreiran = Column(DateTime(timezone=True), server_default=func.now())

    oprema = relationship("Oprema", back_populates="komponente")
    kvarovi = relationship("Kvar", back_populates="komponenta")


class Dobavljac(Base):
    __tablename__ = "dobavljaci"

    id = Column(Integer, primary_key=True, index=True)
    naziv = Column(String(180), unique=True, nullable=False, index=True)
    oznaka = Column(String(40), nullable=True)
    aktivan = Column(Boolean, default=True, nullable=False)
    kreiran = Column(DateTime(timezone=True), server_default=func.now())

    rezervni_dijelovi = relationship("RezervniDio", back_populates="dobavljac")


class RezervniDio(Base):
    __tablename__ = "rezervni_dijelovi"

    id = Column(Integer, primary_key=True, index=True)
    naziv = Column(String(220), nullable=False, index=True)
    sifra = Column(String(100), nullable=True, index=True)
    dobavljac_id = Column(Integer, ForeignKey("dobavljaci.id"), nullable=True, index=True)
    jedinica = Column(String(30), default="kom", nullable=False)
    zaliha = Column(Numeric(10, 2), nullable=True)
    cijena = Column(Numeric(10, 2), nullable=True)
    aktivan = Column(Boolean, default=True, nullable=False)
    kreiran = Column(DateTime(timezone=True), server_default=func.now())

    dobavljac = relationship("Dobavljac", back_populates="rezervni_dijelovi")
    utrosci = relationship("KvarRezervniDio", back_populates="rezervni_dio")


class Kvar(Base):
    __tablename__ = "kvarovi"

    id = Column(Integer, primary_key=True, index=True)
    oprema_id = Column(Integer, ForeignKey("oprema.id"), nullable=False)
    komponenta_id = Column(Integer, ForeignKey("komponente_opreme.id"), nullable=True)
    prijavio_id = Column(Integer, ForeignKey("korisnici.id"), nullable=False)
    voditelj_id = Column(Integer, ForeignKey("korisnici.id"), nullable=True)

    naslov = Column(String(200), nullable=False)
    opis = Column(Text, nullable=True)
    foto_url = Column(String(500), nullable=True)
    prioritet = Column(Enum(PrioritetEnum), default=PrioritetEnum.normalno, nullable=False)
    status = Column(Enum(StatusKvaraEnum), default=StatusKvaraEnum.novo, nullable=False, index=True)

    sto_je_uradjeno = Column(Text, nullable=True)
    materijal = Column(Text, nullable=True)
    troskovi = Column(Numeric(10, 2), default=0)
    trajanje_min = Column(Integer, default=0)
    napomene_voditelja = Column(Text, nullable=True)

    datum_prijave = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    datum_pocetka = Column(DateTime(timezone=True), nullable=True)
    datum_rjesavanja = Column(DateTime(timezone=True), nullable=True)
    # First response: set once, by the server, when a lead or admin first moves the fault out of
    # "Novo". Reopening keeps it: the response window applies to the first response only.
    datum_odziva = Column(DateTime(timezone=True), nullable=True)

    # On hold: why (one of RAZLOZI_CEKANJA) and since when. Cleared when the fault leaves "Na čekanju".
    razlog_cekanja = Column(String(30), nullable=True)
    cekanje_od = Column(DateTime(timezone=True), nullable=True)
    # Incremented on every lead/admin save; a save based on an older version is rejected (409).
    verzija = Column(Integer, default=1, server_default="1", nullable=False)
    # Last change a worker can see (status, assignee, public comment): drives their "updated" badge.
    azurirano = Column(DateTime(timezone=True), nullable=True)
    # Key the reporting device sends with a new report. A retry after a lost response carries the
    # same key and gets the fault already created instead of a duplicate.
    klijent_kljuc = Column(String(64), nullable=True, unique=True, index=True)

    oprema = relationship("Oprema", back_populates="kvarovi")
    komponenta = relationship("KomponentaOpreme", back_populates="kvarovi")
    prijavio = relationship("Korisnik", foreign_keys=[prijavio_id], back_populates="prijavljeni_kvarovi")
    voditelj = relationship("Korisnik", foreign_keys=[voditelj_id], back_populates="rijesavani_kvarovi")
    dogadjaji = relationship("KvarDogadjaj", back_populates="kvar", cascade="all, delete-orphan", order_by="KvarDogadjaj.kreiran")
    utroseni_dijelovi = relationship("KvarRezervniDio", back_populates="kvar", cascade="all, delete-orphan")
    prilozi = relationship("KvarPrilog", back_populates="kvar", cascade="all, delete-orphan", order_by="KvarPrilog.id")

    @property
    def broj_priloga(self) -> int:
        return len(self.prilozi)

    @property
    def otvoren(self) -> bool:
        return self.status != StatusKvaraEnum.rijeseno

    @property
    def ceka_odziv(self) -> bool:
        """Still waiting for its first response: new and never moved on by a lead."""
        return self.status == StatusKvaraEnum.novo and self.datum_odziva is None

    @property
    def odziv_u_roku(self):
        """True/False once the first response is recorded; None while waiting or when unknown."""
        rok = self.rok
        if self.datum_odziva is None or rok is None:
            return None
        return as_utc(self.datum_odziva) <= rok

    @property
    def rok(self):
        """When the response window ends: reported + the priority's SLA hours."""
        hours = SLA_SATI.get(getattr(self.prioritet, "value", self.prioritet))
        if not hours or not self.datum_prijave:
            return None
        return as_utc(self.datum_prijave) + timedelta(hours=hours)

    def udio_roka_u(self, now):
        """Share of the response window used, for a fault still waiting for its first response
        (1.0 = due now, above = late); None otherwise."""
        hours = SLA_SATI.get(getattr(self.prioritet, "value", self.prioritet))
        if not self.ceka_odziv or not hours or not self.datum_prijave:
            return None
        return (now - as_utc(self.datum_prijave)).total_seconds() / 3600 / hours

    def razlozi_paznje_u(self, now) -> list:
        if not self.otvoren:
            return []
        reasons = []
        rok = self.rok
        # Only a fault still waiting for its first response can be overdue or due soon.
        if rok is not None and self.ceka_odziv:
            hours = SLA_SATI[getattr(self.prioritet, "value", self.prioritet)]
            left = (rok - now).total_seconds() / 3600
            if left <= 0:
                reasons.append("kasni")
            elif left <= hours * 0.25:
                reasons.append("uskoro")
        if self.prioritet == PrioritetEnum.hitno:
            reasons.append("hitno")
        if not self.voditelj_id:
            reasons.append("nedodijeljen")
        if (
            self.status == StatusKvaraEnum.na_cekanju
            and self.cekanje_od is not None
            and (now - as_utc(self.cekanje_od)).total_seconds() >= CEKANJE_DUGO_SATI * 3600
        ):
            reasons.append("ceka_dugo")
        return reasons

    @property
    def razlozi_paznje(self) -> list:
        """Why this fault needs attention now, most pressing first (codes from RAZLOZI_PAZNJE)."""
        return self.razlozi_paznje_u(utcnow())


class KvarRezervniDio(Base):
    __tablename__ = "kvar_rezervni_dijelovi"

    id = Column(Integer, primary_key=True, index=True)
    kvar_id = Column(Integer, ForeignKey("kvarovi.id"), nullable=False, index=True)
    rezervni_dio_id = Column(Integer, ForeignKey("rezervni_dijelovi.id"), nullable=False, index=True)
    kolicina = Column(Numeric(10, 2), default=1, nullable=False)
    # Catalogue price per unit when the part was recorded on the fault; costs use this, never
    # today's catalogue price. NULL = the part had no price. `cijena_naknadno`: rows that existed
    # before prices were recorded got the catalogue price at the upgrade (2026-10-29) instead.
    jedinicna_cijena = Column(Numeric(10, 2), nullable=True)
    cijena_naknadno = Column(Boolean, default=False, server_default="false", nullable=False)
    napomena = Column(Text, nullable=True)
    kreiran = Column(DateTime(timezone=True), server_default=func.now())

    kvar = relationship("Kvar", back_populates="utroseni_dijelovi")
    rezervni_dio = relationship("RezervniDio", back_populates="utrosci")


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
    kreiran = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    kvar = relationship("Kvar", back_populates="dogadjaji")
    korisnik = relationship("Korisnik", back_populates="kvar_dogadjaji")


class KvarPrilog(Base):
    """A photo attached to a fault. Stored in the database (re-encoded JPEG, a few hundred kB) so
    backups cover it and no separate file storage is needed on Railway."""
    __tablename__ = "kvar_prilozi"

    id = Column(Integer, primary_key=True, index=True)
    kvar_id = Column(Integer, ForeignKey("kvarovi.id"), nullable=False, index=True)
    korisnik_id = Column(Integer, ForeignKey("korisnici.id"), nullable=True)
    naziv = Column(String(200), nullable=False)
    mime = Column(String(50), nullable=False)
    velicina = Column(Integer, nullable=False)
    sirina = Column(Integer, nullable=True)
    visina = Column(Integer, nullable=True)
    sadrzaj = deferred(Column(LargeBinary, nullable=False))
    kreiran = Column(DateTime(timezone=True), server_default=func.now())

    kvar = relationship("Kvar", back_populates="prilozi")
    korisnik = relationship("Korisnik")


class ZadatakIzvrsenje(Base):
    """One run of a background job (e.g. photo retention): the audit trail and failure counter."""
    __tablename__ = "zadaci_izvrsenja"

    id = Column(Integer, primary_key=True, index=True)
    zadatak = Column(String(40), nullable=False, index=True)
    nacin = Column(String(20), nullable=False)
    status = Column(String(20), nullable=False)  # ok | greska | preskoceno
    pokrenut = Column(DateTime(timezone=True), nullable=False, index=True)
    zavrsen = Column(DateTime(timezone=True), nullable=True)
    kvarova = Column(Integer, default=0, nullable=False)
    fotografija = Column(Integer, default=0, nullable=False)
    obrisano = Column(Integer, default=0, nullable=False)
    poruka = Column(Text, nullable=True)


class PushPretplata(Base):
    __tablename__ = "push_pretplate"

    id = Column(Integer, primary_key=True, index=True)
    korisnik_id = Column(Integer, ForeignKey("korisnici.id"), nullable=False)
    endpoint = Column(Text, nullable=False, unique=True)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)
    kreiran = Column(DateTime(timezone=True), server_default=func.now())

    korisnik = relationship("Korisnik", back_populates="push_pretplate")
