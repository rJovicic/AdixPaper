from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc, func
from typing import List, Optional
from datetime import datetime
from io import BytesIO
import asyncio
import json

from ..database import get_db
from ..models import Kvar, Oprema, Korisnik, PushPretplata, KvarDogadjaj, RolaEnum, PrioritetEnum, StatusKvaraEnum, SLA_SATI
from ..schemas import KvarCreate, KvarVoditeljUpdate, KvarOut, KvarKomentarCreate, KvarDogadjajOut
from ..auth import get_current_user, get_user_from_token, require_voditelj_or_admin, role_value

router = APIRouter(prefix="/api/kvarovi", tags=["kvarovi"])

OPEN_STATUSES = {StatusKvaraEnum.novo, StatusKvaraEnum.u_rjesavanju, StatusKvaraEnum.na_cekanju}


def _enum_value(value) -> str:
    raw = getattr(value, "value", value)
    return str(raw) if raw is not None else ""


def _enum_param(enum_cls, value: Optional[str]):
    if not value:
        return None
    normalized = value.strip().lower()
    for item in enum_cls:
        if item.name.lower() == normalized or item.value.lower() == normalized:
            return item
    return value


def _user_label(user: Optional[Korisnik]) -> str:
    if not user:
        return ""
    return f"{user.ime} {user.prezime}".strip() or user.username


def _can_manage(user: Korisnik) -> bool:
    return role_value(user.rola) in ("admin", "voditelj")


def _ensure_kvar_access(kvar: Kvar, user: Korisnik):
    if role_value(user.rola) == "radnik" and kvar.prijavio_id != user.id:
        raise HTTPException(status_code=404, detail="Kvar nije pronađen")


def _sla_ratio(kvar: Kvar, now: Optional[datetime] = None) -> Optional[float]:
    if kvar.status == StatusKvaraEnum.rijeseno:
        return None
    limit = SLA_SATI.get(_enum_value(kvar.prioritet))
    if not limit or not kvar.datum_prijave:
        return None
    now = now or datetime.utcnow()
    elapsed = (now - kvar.datum_prijave.replace(tzinfo=None)).total_seconds() / 3600
    return elapsed / limit


def _sla_state(kvar: Kvar, now: Optional[datetime] = None) -> str:
    ratio = _sla_ratio(kvar, now)
    if ratio is None:
        return "nema"
    if ratio >= 1:
        return "kasni"
    if ratio >= 0.75:
        return "uskoro"
    return "ok"


def _add_event(
    db: Session,
    kvar: Kvar,
    user: Optional[Korisnik],
    tip: str,
    naslov: str,
    opis: Optional[str] = None,
    podaci: Optional[dict] = None,
    interno: bool = False,
) -> KvarDogadjaj:
    event = KvarDogadjaj(
        kvar_id=kvar.id,
        korisnik_id=user.id if user else None,
        tip=tip,
        naslov=naslov,
        opis=opis,
        podaci=podaci,
        interno=interno,
    )
    db.add(event)
    return event


def _query_kvarovi(
    db: Session,
    current_user: Korisnik,
    status: Optional[str] = None,
    prioritet: Optional[str] = None,
    oprema_id: Optional[int] = None,
    sla: Optional[str] = None,
) -> List[Kvar]:
    q = db.query(Kvar).options(
        joinedload(Kvar.oprema),
        joinedload(Kvar.prijavio),
        joinedload(Kvar.voditelj)
    )
    if role_value(current_user.rola) == "radnik":
        q = q.filter(Kvar.prijavio_id == current_user.id)
    if status:
        q = q.filter(Kvar.status == _enum_param(StatusKvaraEnum, status))
    if prioritet:
        q = q.filter(Kvar.prioritet == _enum_param(PrioritetEnum, prioritet))
    if oprema_id:
        q = q.filter(Kvar.oprema_id == oprema_id)

    records = q.order_by(desc(Kvar.datum_prijave)).all()
    if sla:
        wanted = sla.strip().lower()
        records = [k for k in records if _sla_state(k) == wanted]
    return records


def _stream_payload(kvar: Kvar) -> dict:
    return {
        "type": "new_kvar",
        "id": kvar.id,
        "naslov": kvar.naslov,
        "status": _enum_value(kvar.status),
        "prioritet": _enum_value(kvar.prioritet),
        "datum_prijave": kvar.datum_prijave.isoformat() if kvar.datum_prijave else None,
        "oprema": {
            "id": kvar.oprema.id,
            "naziv": kvar.oprema.naziv,
            "lokacija": kvar.oprema.lokacija,
        } if kvar.oprema else None,
    }


def _send_push_notifications(db: Session, title: str, body: str, url: str = "/"):
    try:
        from pywebpush import webpush, WebPushException
        from ..config import settings

        if not settings.VAPID_PRIVATE_KEY:
            return

        pretplate = (
            db.query(PushPretplata)
            .join(Korisnik, PushPretplata.korisnik_id == Korisnik.id)
            .filter(Korisnik.aktivan == True, Korisnik.rola.in_([RolaEnum.admin, RolaEnum.voditelj]))
            .all()
        )
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
    sla: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Korisnik = Depends(get_current_user)
):
    return _query_kvarovi(db, current_user, status, prioritet, oprema_id, sla)


@router.get("/stream")
def stream_kvarovi(
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    current_user = get_user_from_token(token, db)
    if not _can_manage(current_user):
        raise HTTPException(status_code=403, detail="Pristup zabranjen")

    async def event_generator():
        last_id = db.query(func.coalesce(func.max(Kvar.id), 0)).scalar() or 0
        yield f"data: {json.dumps({'type': 'ready'}, ensure_ascii=False)}\n\n"

        while True:
            await asyncio.sleep(5)
            records = db.query(Kvar).options(joinedload(Kvar.oprema)).filter(Kvar.id > last_id).order_by(Kvar.id.asc()).all()
            for kvar in records:
                last_id = max(last_id, kvar.id)
                yield f"data: {json.dumps(_stream_payload(kvar), ensure_ascii=False)}\n\n"
            if not records:
                yield f"data: {json.dumps({'type': 'ping'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/export.xlsx")
def export_kvarovi_xlsx(
    status: Optional[str] = None,
    prioritet: Optional[str] = None,
    oprema_id: Optional[int] = None,
    sla: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Korisnik = Depends(require_voditelj_or_admin),
):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    records = _query_kvarovi(db, current_user, status, prioritet, oprema_id, sla)
    wb = Workbook()
    ws = wb.active
    ws.title = "Kvarovi"
    headers = [
        "ID", "Naslov", "Oprema", "Lokacija", "Prioritet", "Status", "SLA",
        "Prijavio", "Voditelj", "Datum prijave", "Datum pocetka", "Datum rjesavanja",
        "Trajanje min", "Troskovi EUR", "Materijal", "Sto je uradjeno"
    ]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="1E3A8A")

    for k in records:
        ws.append([
            k.id,
            k.naslov,
            k.oprema.naziv if k.oprema else "",
            k.oprema.lokacija if k.oprema else "",
            _enum_value(k.prioritet),
            _enum_value(k.status),
            _sla_state(k),
            _user_label(k.prijavio),
            _user_label(k.voditelj),
            k.datum_prijave,
            k.datum_pocetka,
            k.datum_rjesavanja,
            k.trajanje_min or 0,
            float(k.troskovi or 0),
            k.materijal or "",
            k.sto_je_uradjeno or "",
        ])

    for column in ws.columns:
        max_len = max(len(str(cell.value or "")) for cell in column)
        ws.column_dimensions[column[0].column_letter].width = min(max(max_len + 2, 10), 42)

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    headers = {"Content-Disposition": 'attachment; filename="adix-paper-kvarovi.xlsx"'}
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)


@router.get("/export.pdf")
def export_kvarovi_pdf(
    status: Optional[str] = None,
    prioritet: Optional[str] = None,
    oprema_id: Optional[int] = None,
    sla: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: Korisnik = Depends(require_voditelj_or_admin),
):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

    records = _query_kvarovi(db, current_user, status, prioritet, oprema_id, sla)
    output = BytesIO()
    doc = SimpleDocTemplate(output, pagesize=landscape(A4), rightMargin=24, leftMargin=24, topMargin=24, bottomMargin=24)
    styles = getSampleStyleSheet()
    story = [
        Paragraph("Adix Paper - izvjestaj kvarova", styles["Title"]),
        Paragraph(datetime.utcnow().strftime("Generirano: %d.%m.%Y. %H:%M"), styles["Normal"]),
        Spacer(1, 12),
    ]

    rows = [["ID", "Naslov", "Oprema", "Prioritet", "Status", "SLA", "Prijava", "Trosak"]]
    for k in records:
        rows.append([
            str(k.id),
            Paragraph((k.naslov or "")[:48], styles["BodyText"]),
            Paragraph((k.oprema.naziv if k.oprema else "")[:36], styles["BodyText"]),
            _enum_value(k.prioritet),
            _enum_value(k.status),
            _sla_state(k),
            k.datum_prijave.strftime("%d.%m.%Y") if k.datum_prijave else "",
            f"{float(k.troskovi or 0):.2f}",
        ])

    table = Table(rows, repeatRows=1, colWidths=[34, 180, 150, 72, 86, 58, 72, 58])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1E3A8A")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
    ]))
    story.append(table)
    doc.build(story)
    output.seek(0)
    headers = {"Content-Disposition": 'attachment; filename="adix-paper-kvarovi.pdf"'}
    return StreamingResponse(output, media_type="application/pdf", headers=headers)


@router.get("/{kvar_id}", response_model=KvarOut)
def get_kvar(kvar_id: int, db: Session = Depends(get_db), current_user: Korisnik = Depends(get_current_user)):
    kvar = _load_kvar(kvar_id, db)
    _ensure_kvar_access(kvar, current_user)
    return kvar


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
    db.flush()
    _add_event(
        db,
        kvar,
        current_user,
        "created",
        "Kvar prijavljen",
        data.opis,
        {"prioritet": data.prioritet.value, "status": StatusKvaraEnum.novo.value},
    )
    db.commit()
    db.refresh(kvar)

    background_tasks.add_task(
        _send_push_notifications,
        db,
        f"Novi kvar [{data.prioritet.value}]",
        f"{oprema.naziv}: {data.naslov}",
        f"/admin/kvarovi/{kvar.id}"
    )

    return _load_kvar(kvar.id, db)


@router.get("/{kvar_id}/dogadjaji", response_model=List[KvarDogadjajOut])
def list_kvar_dogadjaji(
    kvar_id: int,
    db: Session = Depends(get_db),
    current_user: Korisnik = Depends(get_current_user),
):
    kvar = _load_kvar(kvar_id, db)
    _ensure_kvar_access(kvar, current_user)

    q = db.query(KvarDogadjaj).options(joinedload(KvarDogadjaj.korisnik)).filter(KvarDogadjaj.kvar_id == kvar_id)
    if not _can_manage(current_user):
        q = q.filter(KvarDogadjaj.interno == False)
    return q.order_by(KvarDogadjaj.kreiran.asc(), KvarDogadjaj.id.asc()).all()


@router.post("/{kvar_id}/komentari", response_model=KvarDogadjajOut, status_code=201)
def add_kvar_komentar(
    kvar_id: int,
    data: KvarKomentarCreate,
    db: Session = Depends(get_db),
    current_user: Korisnik = Depends(get_current_user),
):
    tekst = data.tekst.strip()
    if not tekst:
        raise HTTPException(status_code=400, detail="Komentar ne može biti prazan")

    kvar = _load_kvar(kvar_id, db)
    _ensure_kvar_access(kvar, current_user)
    interno = bool(data.interno and _can_manage(current_user))
    event = _add_event(
        db,
        kvar,
        current_user,
        "komentar",
        "Interni komentar" if interno else "Komentar",
        tekst,
        interno=interno,
    )
    db.commit()
    db.refresh(event)
    return event


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
    old_status = _enum_value(kvar.status)
    old_prioritet = _enum_value(kvar.prioritet)
    old_voditelj_id = kvar.voditelj_id

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

    db.flush()

    new_status = _enum_value(kvar.status)
    new_prioritet = _enum_value(kvar.prioritet)

    if old_status != new_status:
        _add_event(
            db,
            kvar,
            current_user,
            "status",
            f"Status promijenjen: {old_status} -> {new_status}",
            podaci={"old": old_status, "new": new_status},
        )
    if old_prioritet != new_prioritet:
        _add_event(
            db,
            kvar,
            current_user,
            "prioritet",
            f"Prioritet promijenjen: {old_prioritet} -> {new_prioritet}",
            podaci={"old": old_prioritet, "new": new_prioritet},
        )
    if old_voditelj_id != kvar.voditelj_id:
        _add_event(
            db,
            kvar,
            current_user,
            "assignment",
            "Promijenjen voditelj kvara",
            podaci={"old": old_voditelj_id, "new": kvar.voditelj_id},
        )

    detail_fields = {"sto_je_uradjeno", "materijal", "troskovi", "trajanje_min", "napomene_voditelja"}
    changed_details = sorted(detail_fields.intersection(update_data.keys()))
    if changed_details:
        _add_event(
            db,
            kvar,
            current_user,
            "details",
            "Ažurirani detalji rješavanja",
            podaci={"fields": changed_details},
            interno=changed_details == ["napomene_voditelja"],
        )

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
