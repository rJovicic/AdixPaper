from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator
from typing import Annotated, Optional, List
from datetime import date, datetime
from decimal import Decimal
from .models import RolaEnum, StatusOpremaEnum, TvrtkaEnum, PrioritetEnum, StatusKvaraEnum


class CleanModel(BaseModel):
    """Trims strings and turns blank optional text into None.

    Forms send "" for untouched optional fields; storing "" in UNIQUE columns
    (email, serial number) made the second such record fail.
    """

    @field_validator("*", mode="before")
    @classmethod
    def _clean_text(cls, value, info: ValidationInfo):
        if isinstance(value, str) and info.field_name != "password":
            value = value.strip()
            return value or None
        return value


Name = Annotated[str, Field(min_length=1, max_length=100)]
ShortText = Annotated[str, Field(max_length=200)]
LongText = Annotated[str, Field(max_length=5000)]
Password = Annotated[str, Field(min_length=8, max_length=72)]
Username = Annotated[str, Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9._-]+$")]
Money = Annotated[Decimal, Field(ge=0, max_digits=10, decimal_places=2)]


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
class KorisnikBase(CleanModel):
    username: str
    ime: str
    prezime: str
    email: Optional[str] = None
    telefon: Optional[str] = None
    odjel: Optional[str] = None
    rola: RolaEnum = RolaEnum.radnik

class KorisnikCreate(KorisnikBase):
    username: Username
    ime: Name
    prezime: Name
    email: Optional[Annotated[str, Field(max_length=150, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]] = None
    telefon: Optional[Annotated[str, Field(max_length=20)]] = None
    odjel: Optional[Name] = None
    password: Password

class KorisnikUpdate(CleanModel):
    ime: Optional[Name] = None
    prezime: Optional[Name] = None
    email: Optional[Annotated[str, Field(max_length=150, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]] = None
    telefon: Optional[Annotated[str, Field(max_length=20)]] = None
    odjel: Optional[Name] = None
    rola: Optional[RolaEnum] = None
    aktivan: Optional[bool] = None
    password: Optional[Password] = None

class KorisnikOut(KorisnikBase):
    id: int
    aktivan: bool
    kreiran: datetime
    zadnja_prijava: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class KorisnikMini(BaseModel):
    id: int
    ime: str
    prezime: str
    username: str

    model_config = ConfigDict(from_attributes=True)


# --- OPREMA ---
class OpremaBase(CleanModel):
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
    naziv: Annotated[str, Field(min_length=1, max_length=200)]
    tip: Name
    serijski_broj: Optional[Name] = None
    lokacija: Optional[Annotated[str, Field(max_length=150)]] = None
    napomene: Optional[LongText] = None

class OpremaUpdate(CleanModel):
    naziv: Optional[Annotated[str, Field(min_length=1, max_length=200)]] = None
    tip: Optional[Name] = None
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

    model_config = ConfigDict(from_attributes=True)

class OpremaMini(BaseModel):
    id: int
    naziv: str
    lokacija: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class KomponentaBase(CleanModel):
    naziv: Annotated[str, Field(min_length=1, max_length=150)]
    opis: Optional[LongText] = None
    aktivna: bool = True


class KomponentaCreate(KomponentaBase):
    oprema_id: Optional[int] = None


class KomponentaUpdate(CleanModel):
    naziv: Optional[Annotated[str, Field(min_length=1, max_length=150)]] = None
    opis: Optional[str] = None
    aktivna: Optional[bool] = None


class KomponentaOut(KomponentaBase):
    id: int
    oprema_id: int
    kreiran: datetime

    model_config = ConfigDict(from_attributes=True)


class KomponentaMini(BaseModel):
    id: int
    naziv: str

    model_config = ConfigDict(from_attributes=True)

class OpremaWithStats(OpremaOut):
    broj_kvarova: int = 0
    ukupni_troskovi: float = 0
    zadnji_kvar: Optional[datetime] = None


# --- KVAR ---
class KvarCreate(CleanModel):
    oprema_id: int
    komponenta_id: Optional[int] = None
    naslov: ShortText = Field(min_length=1)
    opis: Optional[LongText] = None
    prioritet: PrioritetEnum = PrioritetEnum.normalno
    foto_url: Optional[str] = None


class KvarRezervniDioInput(CleanModel):
    rezervni_dio_id: int
    kolicina: Decimal = Field(default=Decimal("1"), gt=0, max_digits=10, decimal_places=2)
    napomena: Optional[ShortText] = None

class KvarVoditeljUpdate(CleanModel):
    status: Optional[StatusKvaraEnum] = None
    voditelj_id: Optional[int] = None
    komponenta_id: Optional[int] = None
    sto_je_uradjeno: Optional[LongText] = None
    materijal: Optional[LongText] = None
    troskovi: Optional[Money] = None
    trajanje_min: Optional[Annotated[int, Field(ge=0, le=525600)]] = None
    napomene_voditelja: Optional[LongText] = None
    datum_pocetka: Optional[datetime] = None
    datum_rjesavanja: Optional[datetime] = None
    prioritet: Optional[PrioritetEnum] = None
    utroseni_dijelovi: Optional[List[KvarRezervniDioInput]] = None


class KvarKomentarCreate(CleanModel):
    tekst: LongText = Field(min_length=1)
    interno: bool = False


class KvarDogadjajOut(BaseModel):
    id: int
    kvar_id: int
    korisnik_id: Optional[int] = None
    tip: str
    naslov: str
    opis: Optional[str] = None
    podaci: Optional[dict] = None
    interno: bool
    kreiran: datetime
    korisnik: Optional[KorisnikMini] = None

    model_config = ConfigDict(from_attributes=True)


class DobavljacBase(CleanModel):
    naziv: Annotated[str, Field(min_length=1, max_length=180)]
    oznaka: Optional[Annotated[str, Field(max_length=40)]] = None
    aktivan: bool = True


class DobavljacCreate(DobavljacBase):
    pass


class DobavljacUpdate(CleanModel):
    naziv: Optional[Annotated[str, Field(min_length=1, max_length=180)]] = None
    oznaka: Optional[str] = None
    aktivan: Optional[bool] = None


class DobavljacOut(DobavljacBase):
    id: int
    kreiran: datetime

    model_config = ConfigDict(from_attributes=True)


class RezervniDioBase(CleanModel):
    naziv: Annotated[str, Field(min_length=1, max_length=220)]
    sifra: Optional[Annotated[str, Field(max_length=100)]] = None
    dobavljac_id: int
    jedinica: Annotated[str, Field(max_length=30)] = "kom"
    zaliha: Optional[Annotated[Decimal, Field(max_digits=10, decimal_places=2)]] = None
    cijena: Optional[Money] = None
    aktivan: bool = True


class RezervniDioCreate(RezervniDioBase):
    pass


class RezervniDioUpdate(CleanModel):
    naziv: Optional[Annotated[str, Field(min_length=1, max_length=220)]] = None
    sifra: Optional[Annotated[str, Field(max_length=100)]] = None
    dobavljac_id: Optional[int] = None
    jedinica: Optional[Annotated[str, Field(max_length=30)]] = None
    zaliha: Optional[Annotated[Decimal, Field(max_digits=10, decimal_places=2)]] = None
    cijena: Optional[Money] = None
    aktivan: Optional[bool] = None


class RezervniDioOut(RezervniDioBase):
    id: int
    kreiran: datetime
    dobavljac: Optional[DobavljacOut] = None

    model_config = ConfigDict(from_attributes=True)


class KvarRezervniDioOut(BaseModel):
    id: int
    kvar_id: int
    rezervni_dio_id: int
    kolicina: Decimal
    napomena: Optional[str] = None
    rezervni_dio: Optional[RezervniDioOut] = None

    model_config = ConfigDict(from_attributes=True)


class KvarOut(BaseModel):
    id: int
    oprema_id: int
    komponenta_id: Optional[int] = None
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
    komponenta: Optional[KomponentaMini] = None
    prijavio: Optional[KorisnikMini] = None
    voditelj: Optional[KorisnikMini] = None
    utroseni_dijelovi: List[KvarRezervniDioOut] = []

    model_config = ConfigDict(from_attributes=True)


class KvarNovoOut(BaseModel):
    id: int
    naslov: str
    prioritet: PrioritetEnum
    status: StatusKvaraEnum
    datum_prijave: datetime
    oprema: Optional[OpremaMini] = None

    model_config = ConfigDict(from_attributes=True)


# --- PUSH NOTIFIKACIJE ---
class PushSubscribeData(BaseModel):
    endpoint: Annotated[str, Field(min_length=1, max_length=2000)]
    p256dh: Annotated[str, Field(min_length=1, max_length=500)]
    auth: Annotated[str, Field(min_length=1, max_length=500)]

class PushSend(BaseModel):
    title: ShortText
    body: Annotated[str, Field(max_length=1000)]
    url: Optional[str] = None


# --- DASHBOARD ---
class DashboardStats(BaseModel):
    ukupno_kvarova: int
    ukupno_opreme: int
    aktivna_oprema: int
    neispravna_oprema: int
    na_servisu: int
    otvoreni_kvarovi: int
    u_rjesavanju_kvarovi: int
    rijeseni_kvarovi: int
    kvarovi_danas: int
    rijeseni_ovaj_mjesec: int
    ukupni_troskovi_ovaj_mjesec: float
    ukupni_troskovi_godina: float
    broj_radnika: int
    hitni_kvarovi: int
    ukupni_zastoj_min: int
    rezervni_dijelovi_ovaj_mjesec: float
    sla_kasni: int
    sla_uskoro: int
    prosjecno_vrijeme_rjesavanja_min: float

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


class KvaroviPoPrioritetu(BaseModel):
    prioritet: str
    broj: int


class TopKomponentaKvarovi(BaseModel):
    naziv: str
    oprema: Optional[str] = None
    broj_kvarova: int


class SparePartUsageSummary(BaseModel):
    naziv: str
    sifra: Optional[str] = None
    dobavljac: str
    kolicina: float
    trosak: float
