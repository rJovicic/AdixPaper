from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from .models import RolaEnum, StatusOpremaEnum, TvrtkaEnum, PrioritetEnum, StatusKvaraEnum


# --- AUTH ---
class Token(BaseModel):
    access_token: str
    token_type: str
    rola: str
    role: str
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

class KorisnikMini(BaseModel):
    id: int
    ime: str
    prezime: str
    username: str

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

class OpremaMini(BaseModel):
    id: int
    naziv: str
    lokacija: Optional[str] = None

    class Config:
        from_attributes = True

class OpremaWithStats(OpremaOut):
    broj_kvarova: int = 0
    ukupni_troskovi: float = 0
    zadnji_kvar: Optional[datetime] = None


# --- KVAR ---
class KvarCreate(BaseModel):
    oprema_id: int
    naslov: str
    opis: Optional[str] = None
    prioritet: PrioritetEnum = PrioritetEnum.normalno
    foto_url: Optional[str] = None

class KvarVoditeljUpdate(BaseModel):
    status: Optional[StatusKvaraEnum] = None
    voditelj_id: Optional[int] = None
    sto_je_uradjeno: Optional[str] = None
    materijal: Optional[str] = None
    troskovi: Optional[Decimal] = None
    trajanje_min: Optional[int] = None
    napomene_voditelja: Optional[str] = None
    datum_pocetka: Optional[datetime] = None
    datum_rjesavanja: Optional[datetime] = None
    prioritet: Optional[PrioritetEnum] = None

class KvarOut(BaseModel):
    id: int
    oprema_id: int
    prijavio_id: int
    voditelj_id: Optional[int] = None
    naslov: str
    opis: Optional[str] = None
    foto_url: Optional[str] = None
    prioritet: PrioritetEnum
    status: StatusKvaraEnum
    sto_je_uradjeno: Optional[str] = None
    materijal: Optional[str] = None
    troskovi: Optional[Decimal] = None
    trajanje_min: Optional[int] = None
    napomene_voditelja: Optional[str] = None
    datum_prijave: datetime
    datum_pocetka: Optional[datetime] = None
    datum_rjesavanja: Optional[datetime] = None
    oprema: Optional[OpremaMini] = None
    prijavio: Optional[KorisnikMini] = None
    voditelj: Optional[KorisnikMini] = None

    class Config:
        from_attributes = True


# --- PUSH NOTIFIKACIJE ---
class PushSubscribeData(BaseModel):
    endpoint: str
    p256dh: str
    auth: str

class PushSend(BaseModel):
    title: str
    body: str
    url: Optional[str] = None


# --- DASHBOARD ---
class DashboardStats(BaseModel):
    ukupno_opreme: int
    aktivna_oprema: int
    neispravna_oprema: int
    na_servisu: int
    otvoreni_kvarovi: int
    kvarovi_danas: int
    rijeseni_ovaj_mjesec: int
    ukupni_troskovi_ovaj_mjesec: float
    ukupni_troskovi_godina: float
    broj_radnika: int
    hitni_kvarovi: int

class KvaroviPoMjesecu(BaseModel):
    mjesec: str
    ukupno: int
    rijeseno: int
    troskovi: float

class TopOpremaKvarovi(BaseModel):
    naziv: str
    lokacija: Optional[str] = None
    broj_kvarova: int
    ukupni_troskovi: float

class KvaroviPoStatusu(BaseModel):
    status: str
    broj: int
