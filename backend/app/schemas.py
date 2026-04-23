from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from .models import RolaEnum, StatusOpremaEnum, StatusOdrzavanjaEnum, TvrtkaEnum


# --- AUTH ---
class Token(BaseModel):
    access_token: str
    token_type: str
    rola: str
    ime: str
    prezime: str
    user_id: int

class TokenData(BaseModel):
    username: Optional[str] = None


# --- KORISNIK ---
class KorisnikBase(BaseModel):
    username: str
    ime: str
    prezime: str
    email: Optional[str] = None
    telefon: Optional[str] = None
    odjel: Optional[str] = None
    rola: RolaEnum = RolaEnum.radnik

class KorisnikCreate(KorisnikBase):
    password: str

class KorisnikUpdate(BaseModel):
    ime: Optional[str] = None
    prezime: Optional[str] = None
    email: Optional[str] = None
    telefon: Optional[str] = None
    odjel: Optional[str] = None
    rola: Optional[RolaEnum] = None
    aktivan: Optional[bool] = None
    password: Optional[str] = None

class KorisnikOut(KorisnikBase):
    id: int
    aktivan: bool
    kreiran: datetime
    zadnja_prijava: Optional[datetime] = None

    class Config:
        from_attributes = True


# --- OPREMA ---
class OpremaBase(BaseModel):
    naziv: str
    tip: str
    tvrtka: Optional[TvrtkaEnum] = None
    proizvodac: Optional[str] = None
    model: Optional[str] = None
    serijski_broj: Optional[str] = None
    lokacija: Optional[str] = None
    datum_kupnje: Optional[date] = None
    status: Optional[StatusOpremaEnum] = StatusOpremaEnum.aktivno
    napomene: Optional[str] = None

class OpremaCreate(OpremaBase):
    pass

class OpremaUpdate(BaseModel):
    naziv: Optional[str] = None
    tip: Optional[str] = None
    tvrtka: Optional[TvrtkaEnum] = None
    proizvodac: Optional[str] = None
    model: Optional[str] = None
    serijski_broj: Optional[str] = None
    lokacija: Optional[str] = None
    datum_kupnje: Optional[date] = None
    status: Optional[StatusOpremaEnum] = None
    napomene: Optional[str] = None

class OpremaOut(OpremaBase):
    id: int
    qr_kod: Optional[str] = None
    kreiran: datetime

    class Config:
        from_attributes = True

class OpremaWithStats(OpremaOut):
    broj_odrzavanja: int = 0
    ukupni_troskovi: float = 0
    zadnje_odrzavanje: Optional[date] = None


# --- ODRZAVANJE ---
class OdrzavanjeBase(BaseModel):
    oprema_id: int
    datum: date
    vrsta_odrzavanja: str
    opis: Optional[str] = None
    materijal: Optional[str] = None
    troskovi: Optional[Decimal] = Decimal("0")
    trajanje: Optional[int] = 0
    status: Optional[StatusOdrzavanjaEnum] = StatusOdrzavanjaEnum.zavrseno
    napomene: Optional[str] = None
    izvodioc_id: Optional[int] = None

class OdrzavanjeCreate(OdrzavanjeBase):
    pass

class OdrzavanjeUpdate(BaseModel):
    datum: Optional[date] = None
    vrsta_odrzavanja: Optional[str] = None
    opis: Optional[str] = None
    materijal: Optional[str] = None
    troskovi: Optional[Decimal] = None
    trajanje: Optional[int] = None
    status: Optional[StatusOdrzavanjaEnum] = None
    napomene: Optional[str] = None
    izvodioc_id: Optional[int] = None

class OdrzavanjeOut(OdrzavanjeBase):
    id: int
    kreiran: datetime
    kreirao_id: Optional[int] = None
    oprema_naziv: Optional[str] = None
    izvodioc_ime: Optional[str] = None

    class Config:
        from_attributes = True


# --- DASHBOARD ---
class DashboardStats(BaseModel):
    ukupno_opreme: int
    aktivna_oprema: int
    neispravna_oprema: int
    na_servisu: int
    ukupno_odrzavanja: int
    odrzavanja_ovaj_mjesec: int
    ukupni_troskovi_ovaj_mjesec: float
    ukupni_troskovi_godina: float
    broj_radnika: int

class TroskoviPoMjesecu(BaseModel):
    mjesec: str
    troskovi: float
    broj_odrzavanja: int

class OdrzavanjePoVrsti(BaseModel):
    vrsta: str
    broj: int

class TopOpremaKvarovi(BaseModel):
    naziv: str
    lokacija: Optional[str]
    broj_kvarova: int
    ukupni_troskovi: float
