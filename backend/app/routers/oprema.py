from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from ..database import get_db
from ..models import Oprema, Kvar, Korisnik, KomponentaOpreme, StatusOpremaEnum, TvrtkaEnum
from ..schemas import OpremaCreate, OpremaOut, OpremaUpdate, OpremaWithStats, KomponentaCreate, KomponentaUpdate, KomponentaOut
from ..auth import get_current_user, require_admin, require_voditelj_or_admin, role_value
from ..config import settings

router = APIRouter(prefix="/api/oprema", tags=["oprema"])

@router.get("", response_model=List[OpremaWithStats])
def get_oprema(
    search: Optional[str] = Query(None),
    status: Optional[StatusOpremaEnum] = Query(None),
    tvrtka: Optional[TvrtkaEnum] = Query(None),
    db: Session = Depends(get_db),
    current_user: Korisnik = Depends(get_current_user)
):
    query = db.query(Oprema)
    if search:
        query = query.filter(
            Oprema.naziv.ilike(f"%{search}%") |
            Oprema.tip.ilike(f"%{search}%") |
            Oprema.serijski_broj.ilike(f"%{search}%") |
            Oprema.lokacija.ilike(f"%{search}%")
        )
    if status:
        query = query.filter(Oprema.status == status)
    if tvrtka:
        query = query.filter(Oprema.tvrtka == tvrtka)

    oprema_list = query.order_by(Oprema.naziv).all()

    # One grouped query instead of one per machine.
    stats = {
        row.oprema_id: row
        for row in db.query(
            Kvar.oprema_id,
            func.count(Kvar.id).label("broj"),
            func.coalesce(func.sum(Kvar.troskovi), 0).label("troskovi"),
            func.max(Kvar.datum_prijave).label("zadnji"),
        ).group_by(Kvar.oprema_id).all()
    }

    result = []
    for o in oprema_list:
        item = OpremaWithStats.model_validate(o)
        row = stats.get(o.id)
        if row:
            item.broj_kvarova = row.broj or 0
            item.ukupni_troskovi = float(row.troskovi or 0)
            item.zadnji_kvar = row.zadnji
        result.append(_for_user(item, current_user))

    return result

def _for_user(item: OpremaWithStats, user: Korisnik) -> OpremaWithStats:
    """Workers pick machines to report on; repair costs are not theirs to see."""
    if role_value(user.rola) == "radnik":
        item.ukupni_troskovi = None
    return item


def machine_link(base_url: str, oprema_id: int) -> str:
    """What a machine's QR code opens: workers land on the report form, leads on its faults."""
    return f"{base_url.rstrip('/')}/m/{oprema_id}"


def _draw_label(canvas, x: float, y: float, width: float, height: float, machine: Oprema, url: str):
    from reportlab.graphics import renderPDF
    from reportlab.graphics.barcode.qr import QrCodeWidget
    from reportlab.graphics.shapes import Drawing
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph
    from reportlab.lib.styles import ParagraphStyle

    from ..pdf import BRAND_BLUE, SHELL_DEEP, register_fonts

    regular, bold = register_fonts()
    pad = 4 * mm

    # Cut line.
    canvas.setStrokeColor(colors.HexColor("#B8BEC7"))
    canvas.setDash(2, 2)
    canvas.setLineWidth(0.4)
    canvas.rect(x, y, width, height)
    canvas.setDash()

    qr_size = height - 2 * pad
    # Q recovers ~25 % of damaged modules: labels on machines get oil, dust and scratches.
    widget = QrCodeWidget(url, barLevel="Q")
    x0, y0, x1, y1 = widget.getBounds()
    drawing = Drawing(qr_size, qr_size, transform=[qr_size / (x1 - x0), 0, 0, qr_size / (y1 - y0), 0, 0])
    drawing.add(widget)
    renderPDF.draw(drawing, canvas, x + pad, y + pad)

    text_x = x + pad + qr_size + 3 * mm
    text_width = width - (text_x - x) - pad
    top = y + height - pad

    canvas.setFillColor(colors.HexColor(BRAND_BLUE))
    canvas.setFont(bold, 7)
    canvas.drawString(text_x, top - 7, "ADIX PAPER")

    name_style = ParagraphStyle("name", fontName=bold, fontSize=12, leading=14, textColor=colors.HexColor("#15181D"))
    name = Paragraph(machine.naziv, name_style)
    _, name_height = name.wrap(text_width, height)
    name.drawOn(canvas, text_x, top - 12 - name_height)

    meta = " · ".join(part for part in (machine.tip, machine.lokacija) if part)
    meta_style = ParagraphStyle("meta", fontName=regular, fontSize=8, leading=10, textColor=colors.HexColor("#474E59"))
    meta_paragraph = Paragraph(meta, meta_style)
    _, meta_height = meta_paragraph.wrap(text_width, height)
    meta_paragraph.drawOn(canvas, text_x, top - 15 - name_height - meta_height)

    canvas.setFillColor(colors.HexColor(SHELL_DEEP))
    canvas.setFont(bold, 9)
    canvas.drawString(text_x, y + pad + 12, "Kvar? Skenirajte kod.")
    canvas.setFillColor(colors.HexColor("#636B77"))
    canvas.setFont(regular, 7)
    canvas.drawString(text_x, y + pad + 2, f"Mašina #{machine.id}")


@router.get("/qr-oznake.pdf")
def machine_qr_labels(
    request: Request,
    ids: Optional[str] = Query(None, description="Comma-separated machine ids; default: every machine not decommissioned"),
    db: Session = Depends(get_db),
    _: Korisnik = Depends(require_voditelj_or_admin),
):
    """A4 sheet of cut-out labels, one per machine, each with a QR code that opens the fault report for it."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as pdf_canvas

    query = db.query(Oprema)
    if ids:
        try:
            wanted = [int(value) for value in ids.split(",") if value.strip()]
        except ValueError:
            raise HTTPException(status_code=422, detail="Neispravna vrijednost filtra") from None
        query = query.filter(Oprema.id.in_(wanted))
    else:
        query = query.filter(Oprema.status != StatusOpremaEnum.raspisano)
    machines = query.order_by(Oprema.naziv).all()
    if not machines:
        raise HTTPException(status_code=404, detail="Oprema nije pronađena")

    base_url = settings.PUBLIC_URL or str(request.base_url)
    output = BytesIO()
    canvas = pdf_canvas.Canvas(output, pagesize=A4)
    canvas.setTitle("Adix Paper – QR oznake mašina")
    page_width, page_height = A4
    columns, rows = 2, 5
    margin = 10 * mm
    width = (page_width - 2 * margin) / columns
    height = (page_height - 2 * margin) / rows
    for index, machine in enumerate(machines):
        slot = index % (columns * rows)
        if index and slot == 0:
            canvas.showPage()
        column, row = slot % columns, slot // columns
        _draw_label(canvas, margin + column * width, page_height - margin - (row + 1) * height, width, height, machine, machine_link(base_url, machine.id))
    canvas.save()
    output.seek(0)
    headers = {"Content-Disposition": 'attachment; filename="adix-paper-qr-oznake.pdf"'}
    return StreamingResponse(output, media_type="application/pdf", headers=headers)


@router.get("/{oprema_id}", response_model=OpremaWithStats)
def get_oprema_by_id(oprema_id: int, db: Session = Depends(get_db), current_user: Korisnik = Depends(get_current_user)):
    o = db.query(Oprema).filter(Oprema.id == oprema_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Oprema nije pronađena")

    stats = db.query(
        func.count(Kvar.id).label("broj"),
        func.coalesce(func.sum(Kvar.troskovi), 0).label("troskovi"),
        func.max(Kvar.datum_prijave).label("zadnji")
    ).filter(Kvar.oprema_id == o.id).first()

    item = OpremaWithStats.model_validate(o)
    item.broj_kvarova = stats.broj or 0
    item.ukupni_troskovi = float(stats.troskovi or 0)
    item.zadnji_kvar = stats.zadnji
    return _for_user(item, current_user)

@router.post("", response_model=OpremaOut)
def create_oprema(data: OpremaCreate, db: Session = Depends(get_db), _: Korisnik = Depends(require_voditelj_or_admin)):
    if data.serijski_broj and db.query(Oprema).filter(Oprema.serijski_broj == data.serijski_broj).first():
        raise HTTPException(status_code=400, detail="Serijski broj već postoji")

    oprema = Oprema(**data.model_dump())
    db.add(oprema)
    db.commit()
    db.refresh(oprema)
    return oprema

@router.put("/{oprema_id}", response_model=OpremaOut)
def update_oprema(oprema_id: int, data: OpremaUpdate, db: Session = Depends(get_db), _: Korisnik = Depends(require_voditelj_or_admin)):
    oprema = db.query(Oprema).filter(Oprema.id == oprema_id).first()
    if not oprema:
        raise HTTPException(status_code=404, detail="Oprema nije pronađena")

    update_data = data.model_dump(exclude_unset=True)
    serijski = update_data.get("serijski_broj")
    if serijski and db.query(Oprema.id).filter(Oprema.serijski_broj == serijski, Oprema.id != oprema_id).first():
        raise HTTPException(status_code=400, detail="Serijski broj već postoji")
    for field, value in update_data.items():
        setattr(oprema, field, value)

    db.commit()
    db.refresh(oprema)
    return oprema


@router.get("/{oprema_id}/komponente", response_model=List[KomponentaOut])
def get_komponente(oprema_id: int, db: Session = Depends(get_db), _: Korisnik = Depends(get_current_user)):
    if not db.query(Oprema.id).filter(Oprema.id == oprema_id).first():
        raise HTTPException(status_code=404, detail="Oprema nije pronađena")
    return db.query(KomponentaOpreme).filter(
        KomponentaOpreme.oprema_id == oprema_id
    ).order_by(KomponentaOpreme.naziv).all()


@router.post("/{oprema_id}/komponente", response_model=KomponentaOut, status_code=201)
def create_komponenta(
    oprema_id: int,
    data: KomponentaCreate,
    db: Session = Depends(get_db),
    _: Korisnik = Depends(require_voditelj_or_admin)
):
    if not db.query(Oprema.id).filter(Oprema.id == oprema_id).first():
        raise HTTPException(status_code=404, detail="Oprema nije pronađena")
    naziv = data.naziv.strip()
    if not naziv:
        raise HTTPException(status_code=400, detail="Naziv komponente je obavezan")
    komponenta = KomponentaOpreme(
        oprema_id=oprema_id,
        naziv=naziv,
        opis=data.opis,
        aktivna=data.aktivna,
    )
    db.add(komponenta)
    db.commit()
    db.refresh(komponenta)
    return komponenta


@router.put("/komponente/{komponenta_id}", response_model=KomponentaOut)
def update_komponenta(
    komponenta_id: int,
    data: KomponentaUpdate,
    db: Session = Depends(get_db),
    _: Korisnik = Depends(require_voditelj_or_admin)
):
    komponenta = db.query(KomponentaOpreme).filter(KomponentaOpreme.id == komponenta_id).first()
    if not komponenta:
        raise HTTPException(status_code=404, detail="Komponenta nije pronađena")
    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "naziv" and value is not None:
            value = value.strip()
            if not value:
                raise HTTPException(status_code=400, detail="Naziv komponente je obavezan")
        setattr(komponenta, field, value)
    db.commit()
    db.refresh(komponenta)
    return komponenta


@router.delete("/komponente/{komponenta_id}", status_code=204)
def delete_komponenta(
    komponenta_id: int,
    db: Session = Depends(get_db),
    _: Korisnik = Depends(require_voditelj_or_admin)
):
    komponenta = db.query(KomponentaOpreme).filter(KomponentaOpreme.id == komponenta_id).first()
    if not komponenta:
        raise HTTPException(status_code=404, detail="Komponenta nije pronađena")
    if db.query(Kvar.id).filter(Kvar.komponenta_id == komponenta_id).first():
        komponenta.aktivna = False
    else:
        db.delete(komponenta)
    db.commit()

@router.delete("/{oprema_id}")
def delete_oprema(oprema_id: int, db: Session = Depends(get_db), _: Korisnik = Depends(require_admin)):
    oprema = db.query(Oprema).filter(Oprema.id == oprema_id).first()
    if not oprema:
        raise HTTPException(status_code=404, detail="Oprema nije pronađena")
    if db.query(Kvar.id).filter(Kvar.oprema_id == oprema_id).first():
        raise HTTPException(
            status_code=409,
            detail="Mašina ima evidentirane kvarove i ne može se obrisati. Postavite status na Raspisano.",
        )
    db.delete(oprema)
    db.commit()
    return {"detail": "Oprema obrisana"}
