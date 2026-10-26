import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import PushPretplata, Korisnik
from ..schemas import PushSubscribeData, PushSend
from ..auth import get_current_user, require_voditelj_or_admin
from ..config import settings

router = APIRouter(prefix="/api/notifikacije", tags=["notifikacije"])


@router.post("/pretplata", status_code=201)
def subscribe(
    data: PushSubscribeData,
    db: Session = Depends(get_db),
    current_user: Korisnik = Depends(get_current_user)
):
    existing = db.query(PushPretplata).filter(PushPretplata.endpoint == data.endpoint).first()
    if existing:
        existing.p256dh = data.p256dh
        existing.auth = data.auth
        existing.korisnik_id = current_user.id
        db.commit()
        return {"status": "updated"}

    pretplata = PushPretplata(
        korisnik_id=current_user.id,
        endpoint=data.endpoint,
        p256dh=data.p256dh,
        auth=data.auth
    )
    db.add(pretplata)
    db.commit()
    return {"status": "subscribed"}


@router.delete("/pretplata")
def unsubscribe(
    data: PushSubscribeData,
    db: Session = Depends(get_db),
    current_user: Korisnik = Depends(get_current_user)
):
    db.query(PushPretplata).filter(
        PushPretplata.endpoint == data.endpoint,
        PushPretplata.korisnik_id == current_user.id
    ).delete()
    db.commit()
    return {"status": "unsubscribed"}


@router.get("/vapid-public-key")
def get_vapid_public_key():
    return {"public_key": settings.VAPID_PUBLIC_KEY.strip()}


@router.post("/posalji")
def send_notification(
    data: PushSend,
    db: Session = Depends(get_db),
    _: Korisnik = Depends(require_voditelj_or_admin)
):
    try:
        import json
        from pywebpush import webpush, WebPushException

        if not settings.VAPID_PRIVATE_KEY:
            raise HTTPException(status_code=400, detail="Push notifikacije nisu konfigurirane")
        pretplate = db.query(PushPretplata).all()
        sent = 0
        mrtve = []
        for p in pretplate:
            try:
                webpush(
                    subscription_info={
                        "endpoint": p.endpoint,
                        "keys": {"p256dh": p.p256dh, "auth": p.auth}
                    },
                    data=json.dumps({"title": data.title, "body": data.body, "url": data.url or "/"}),
                    vapid_private_key=settings.VAPID_PRIVATE_KEY,
                    vapid_claims={"sub": settings.VAPID_EMAIL}
                )
                sent += 1
            except WebPushException as e:
                if e.response and e.response.status_code in (404, 410):
                    mrtve.append(p.id)
        for pid in mrtve:
            db.query(PushPretplata).filter(PushPretplata.id == pid).delete()
        if mrtve:
            db.commit()
        return {"sent": sent, "expired_removed": len(mrtve)}
    except HTTPException:
        raise
    except Exception:
        logging.getLogger("adixpaper").exception("Manual push send failed")
        raise HTTPException(status_code=502, detail="Slanje notifikacija nije uspjelo") from None
