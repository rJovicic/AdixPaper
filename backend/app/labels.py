"""Printed QR labels for machines and components.

Each label encodes `<PUBLIC_URL>/q/<qr_oznaka>`: an opaque identifier, not a database id, that
stays the same until someone explicitly generates a new one. Labels printed earlier for whole
machines encode `/m/<id>`; that address keeps working (frontend MachineLink).
"""
from dataclasses import dataclass
from io import BytesIO
from typing import Iterable, Optional

from .pdf import BRAND_BLUE, SHELL_DEEP, register_fonts


@dataclass
class Label:
    url: str
    title: str  # the machine, or the component
    parent: Optional[str] = None  # the machine a component belongs to
    meta: str = ""  # model · manufacturer, or type · location
    kind: str = "Mašina"  # printed in the footer: "Mašina" / "Komponenta"


def asset_link(base_url: str, oznaka: str) -> str:
    return f"{base_url.rstrip('/')}/q/{oznaka}"


def _modules(url: str):
    """The QR module matrix (True = dark) and its quiet-zone width, computed once per code.
    Error correction Q recovers ~25 % of damaged modules: labels on machines get oil, dust and scratches."""
    from reportlab.graphics.barcode.qr import QrCodeWidget

    widget = QrCodeWidget(url, barLevel="Q")
    widget.qr.make()
    return [[bool(cell) for cell in row] for row in widget.qr.modules], widget.barBorder


def _runs(row):
    """(start, length) of each run of dark modules in a row: one rectangle per run, not per module."""
    start = None
    for index, dark in enumerate(row + [False]):
        if dark and start is None:
            start = index
        elif not dark and start is not None:
            yield start, index - start
            start = None


def _draw(canvas, x: float, y: float, width: float, height: float, label: Label):
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph

    regular, bold = register_fonts()
    pad = 4 * mm

    # Cut line.
    canvas.setStrokeColor(colors.HexColor("#B8BEC7"))
    canvas.setDash(2, 2)
    canvas.setLineWidth(0.4)
    canvas.rect(x, y, width, height)
    canvas.setDash()

    qr_size = height - 2 * pad
    modules, border = _modules(label.url)
    box = qr_size / (len(modules) + 2 * border)
    canvas.setFillColor(colors.black)
    for r, row in enumerate(modules):
        for start, length in _runs(row):
            canvas.rect(x + pad + (start + border) * box, y + pad + qr_size - (r + border + 1) * box, length * box, box, stroke=0, fill=1)

    text_x = x + pad + qr_size + 3 * mm
    text_width = width - (text_x - x) - pad
    top = y + height - pad

    canvas.setFillColor(colors.HexColor(BRAND_BLUE))
    canvas.setFont(bold, 7)
    canvas.drawString(text_x, top - 7, "ADIX PAPER")
    cursor = top - 12

    if label.parent:
        parent_style = ParagraphStyle("parent", fontName=bold, fontSize=8, leading=10, textColor=colors.HexColor("#474E59"))
        parent = Paragraph(label.parent, parent_style)
        _, used = parent.wrap(text_width, height)
        parent.drawOn(canvas, text_x, cursor - used)
        cursor -= used + 1

    # Long component names wrap rather than shrink: two components must never look alike.
    title_style = ParagraphStyle("title", fontName=bold, fontSize=12 if len(label.title) <= 28 else 10.5, leading=14, textColor=colors.HexColor("#15181D"))
    title = Paragraph(label.title, title_style)
    _, used = title.wrap(text_width, height)
    title.drawOn(canvas, text_x, cursor - used)
    cursor -= used + 2

    if label.meta:
        meta_style = ParagraphStyle("meta", fontName=regular, fontSize=8, leading=10, textColor=colors.HexColor("#474E59"))
        meta = Paragraph(label.meta, meta_style)
        _, used = meta.wrap(text_width, height)
        meta.drawOn(canvas, text_x, cursor - used)

    canvas.setFillColor(colors.HexColor(SHELL_DEEP))
    canvas.setFont(bold, 9)
    canvas.drawString(text_x, y + pad + 12, "Kvar? Skenirajte kod.")
    canvas.setFillColor(colors.HexColor("#636B77"))
    canvas.setFont(regular, 7)
    canvas.drawString(text_x, y + pad + 2, label.kind)


def labels_pdf(labels: Iterable[Label], title: str) -> BytesIO:
    """A4 sheet of cut-out labels, 2 × 5 per page."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as pdf_canvas

    output = BytesIO()
    canvas = pdf_canvas.Canvas(output, pagesize=A4)
    canvas.setTitle(title)
    page_width, page_height = A4
    columns, rows = 2, 5
    margin = 10 * mm
    width = (page_width - 2 * margin) / columns
    height = (page_height - 2 * margin) / rows
    for index, label in enumerate(labels):
        slot = index % (columns * rows)
        if index and slot == 0:
            canvas.showPage()
        column, row = slot % columns, slot // columns
        _draw(canvas, margin + column * width, page_height - margin - (row + 1) * height, width, height, label)
    canvas.save()
    output.seek(0)
    return output


def qr_svg(url: str) -> str:
    """The QR code alone, as SVG in module units (scales to any size), for showing on screen."""
    modules, border = _modules(url)
    side = len(modules) + 2 * border
    rects = "".join(
        f'<rect x="{start + border}" y="{r + border}" width="{length}" height="1"/>'
        for r, row in enumerate(modules) for start, length in _runs(row)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {side} {side}" shape-rendering="crispEdges">'
        f'<rect width="{side}" height="{side}" fill="#fff"/><g fill="#000">{rects}</g></svg>'
    )
