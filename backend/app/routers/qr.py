"""QR labels: resolve a scanned identifier to its machine or component."""
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload

from ..auth import get_current_user, require_voditelj_or_admin
from ..config import settings
from ..database import get_db
from ..labels import asset_link, qr_svg
from ..models import KomponentaOpreme, Korisnik, Oprema
from ..schemas import QrCilj, QrKomponenta, QrMasina

router = APIRouter(prefix="/api/qr", tags=["qr"])

OZNAKA = re.compile(r"^[A-Za-z0-9_-]{8,32}$")
UNKNOWN = "QR oznaka nije prepoznata"


def _find(db: Session, oznaka: str):
    if not OZNAKA.match(oznaka):
        raise HTTPException(status_code=404, detail=UNKNOWN)
    component = db.query(KomponentaOpreme).options(joinedload(KomponentaOpreme.oprema)).filter(KomponentaOpreme.qr_oznaka == oznaka).first()
    if component:
        return component.oprema, component
    machine = db.query(Oprema).filter(Oprema.qr_oznaka == oznaka).first()
    if machine:
        return machine, None
    raise HTTPException(status_code=404, detail=UNKNOWN)


@router.get("/{oznaka}", response_model=QrCilj)
def resolve(oznaka: str, db: Session = Depends(get_db), _: Korisnik = Depends(get_current_user)):
    """Any signed-in user. Inactive machines and components are returned with `aktivna: false`
    so the app can say so instead of failing; reporting on them is refused by the fault API."""
    machine, component = _find(db, oznaka)
    return QrCilj(
        vrsta="komponenta" if component else "masina",
        oprema=QrMasina.model_validate(machine),
        komponenta=QrKomponenta.model_validate(component) if component else None,
    )


@router.get("/{oznaka}/slika.svg")
def image(oznaka: str, request: Request, db: Session = Depends(get_db), _: Korisnik = Depends(require_voditelj_or_admin)):
    """The QR code itself, for the machine and component pages."""
    _find(db, oznaka)
    svg = qr_svg(asset_link(settings.PUBLIC_URL or str(request.base_url), oznaka))
    return Response(svg, media_type="image/svg+xml", headers={"Cache-Control": "private, max-age=3600"})
