from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc
from typing import List, Optional
from datetime import datetime
import json

from ..database import get_db
from ..models import Kvar, Oprema, Korisnik, PushPretplata, PrioritetEnum, StatusKvaraEnum, SLA_SATI
from ..schemas import KvarCreate, KvarVoditeljUpdate, KvarOut
from ..auth import get_current_user, require_voditelj_or_admin, role_value

router = APIRouter(prefix="/api/kvarovi", tags=["kvarovi"])


def _send_push_notifications(db: Session, title: str, body: str, url: str = "/"):
    try:
        from pywebpush import webpush, WebPushException
        from ..config import settings

        if not settings.VAPID_PRIVATE_KEY:
            return

        pretplate = db.query(PushPretplata).all()
        mrtve = []
        for p in pretplate:
            try:
                webpush(
                    subscription_info={
                        "endpoint": p.endpoint,
                        "keys": {"p256dh": p.p256dh, "auth": p.auth}
                    },
                    data=json.dumps({"title": title, "body": body, "url": url}),
                    vapid_private_key=settings.VAPID_PRIVATE_KEY,
                    vapid_claims={"sub": settings.VAPID_EMAIL}
                )
            except WebPushException as e:
                if e.response and e.response.status_code in (404, 410):
                    mrtve.append(p.id)
        for pid in mrtve:
            db.query(PushPretplata).filter(PushPretplata.id == pid).delete()
        if mrtve:
            db.commit()
    except Exception:
        pass


def _load_kvar(kvar_id: int, db: Session) -> Kvar:
    kvar = db.query(Kvar).options(
        joinedload(Kvar.oprema),
        joinedload(Kvar.prijavio),
        joinedload(Kvar.voditelj)
    ).filter(Kvar.id == kvar_id).first()
    if not kvar:
        raise HTTPException(status_code=404, detail="Kvar nije pronađen")
    return kvar


@router.get("", response_model=List[KvarOut])
def list_kvarovi(
    status: Optional[str] = None,
    prioritet: Optional[str] = None,
    oprema_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: Korisnik = Depends(get_current_user)
):
    q = db.query(Kvar).options(
        joinedload(Kvar.oprema),
        joinedload(Kvar.prijavio),
        joinedload(Kvar.voditelj)
    )
    if role_value(current_user.rola) == "radnik":
        q = q.filter(Kvar.prijavio_id == current_user.id)
    if status:
        q = q.filter(Kvar.status == status)
    if prioritet:
        q = q.filter(Kvar.prioritet == prioritet)
    if oprema_id:
        q = q.filter(Kvar.oprema_id == oprema_id)
    return q.order_by(desc(Kvar.datum_prijave)).all()


@router.get("/{kvar_id}", response_model=KvarOut)
def get_kvar(kvar_id: int, db: Session = Depends(get_db), current_user: Korisnik = Depends(get_current_user)):
    return _load_kvar(kvar_id, db)


@router.post("", response_model=KvarOut, status_code=201)
def create_kvar(
    data: KvarCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: Korisnik = Depends(get_current_user)
):
    oprema = db.query(Oprema).filter(Oprema.id == data.oprema_id).first()
    if not oprema:
        raise HTTPException(status_code=404, detail="Oprema nije pronađena")

    kvar = Kvar(
        oprema_id=data.oprema_id,
        prijavio_id=current_user.id,
        naslov=data.naslov,
        opis=data.opis,
        prioritet=data.prioritet,
        foto_url=data.foto_url,
        status=StatusKvaraEnum.novo
    )
    db.add(kvar)
    db.commit()
    db.refresh(kvar)

    background_tasks.add_task(
        _send_push_notifications,
        db,
        f"🔧 Novi kvar [{data.prioritet.value}]",
        f"{oprema.naziv}: {data.naslov}",
        f"/kvarovi/{kvar.id}"
    )

    return _load_kvar(kvar.id, db)


@router.put("/{kvar_id}", response_model=KvarOut)
def update_kvar(
    kvar_id: int,
    data: KvarVoditeljUpdate,
    db: Session = Depends(get_db),
    current_user: Korisnik = Depends(require_voditelj_or_admin)
):
    kvar = db.query(Kvar).filter(Kvar.id == kvar_id).first()
    if not kvar:
        raise HTTPException(status_code=404, detail="Kvar nije pronađen")

    update_data = data.model_dump(exclude_unset=True)

    if "status" in update_data:
        new_status = update_data["status"]
        if new_status == StatusKvaraEnum.u_rjesavanju and not kvar.datum_pocetka:
            kvar.datum_pocetka = datetime.utcnow()
            if not kvar.voditelj_id:
                kvar.voditelj_id = current_user.id
        if new_status == StatusKvaraEnum.rijeseno and not kvar.datum_rjesavanja:
            kvar.datum_rjesavanja = datetime.utcnow()

    for field, value in update_data.items():
        setattr(kvar, field, value)

    db.commit()
    return _load_kvar(kvar_id, db)


@router.delete("/{kvar_id}", status_code=204)
def delete_kvar(
    kvar_id: int,
    db: Session = Depends(get_db),
    _: Korisnik = Depends(require_voditelj_or_admin)
):
    kvar = db.query(Kvar).filter(Kvar.id == kvar_id).first()
    if not kvar:
        raise HTTPException(status_code=404, detail="Kvar nije pronađen")
    db.delete(kvar)
    db.commit()
