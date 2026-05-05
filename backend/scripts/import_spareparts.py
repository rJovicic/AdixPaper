from __future__ import annotations

import argparse
from decimal import Decimal, InvalidOperation
from pathlib import Path
import sys

import xlrd
from sqlalchemy import func

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.database import SessionLocal  # noqa: E402
from backend.app.main import ensure_additive_schema  # noqa: E402
from backend.app.models import Dobavljac, RezervniDio  # noqa: E402


SUPPLIERS = {
    "cupup": {"naziv": "Cupup d.o.o", "oznaka": "CUPUP"},
    "delt": {"naziv": "Delt papir d.o.o", "oznaka": "DELT"},
}


def clean_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def decimal_or_none(value):
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value).replace(",", "."))
    except (InvalidOperation, ValueError):
        return None


def normalize_unit(value: str) -> str:
    unit = clean_text(value).lower()
    return unit or "kom"


def rows_from_cupup(path: Path):
    sheet = xlrd.open_workbook(str(path)).sheet_by_index(0)
    for row_index in range(sheet.nrows):
        code = clean_text(sheet.cell_value(row_index, 0))
        name = clean_text(sheet.cell_value(row_index, 1))
        unit = normalize_unit(sheet.cell_value(row_index, 2) if sheet.ncols > 2 else "kom")
        if code and name:
            yield {"sifra": code, "naziv": name, "jedinica": unit, "zaliha": None, "cijena": None}


def rows_from_delt(path: Path):
    sheet = xlrd.open_workbook(str(path)).sheet_by_index(0)
    for row_index in range(sheet.nrows):
        code = clean_text(sheet.cell_value(row_index, 0))
        name = clean_text(sheet.cell_value(row_index, 1))
        if not code.startswith("RD") or not name:
            continue
        stock = decimal_or_none(sheet.cell_value(row_index, 5) if sheet.ncols > 5 else None)
        unit = normalize_unit(sheet.cell_value(row_index, 8) if sheet.ncols > 8 else "kom")
        price = decimal_or_none(sheet.cell_value(row_index, 9) if sheet.ncols > 9 else None)
        yield {"sifra": code, "naziv": name, "jedinica": unit, "zaliha": stock, "cijena": price}


def get_supplier(db, key: str) -> Dobavljac:
    data = SUPPLIERS[key]
    supplier = db.query(Dobavljac).filter(func.lower(Dobavljac.naziv) == data["naziv"].lower()).first()
    if supplier:
        supplier.aktivan = True
        supplier.oznaka = supplier.oznaka or data["oznaka"]
        return supplier
    supplier = Dobavljac(naziv=data["naziv"], oznaka=data["oznaka"], aktivan=True)
    db.add(supplier)
    db.flush()
    return supplier


def upsert_part(db, supplier: Dobavljac, item: dict) -> str:
    query = db.query(RezervniDio).filter(RezervniDio.dobavljac_id == supplier.id)
    part = query.filter(RezervniDio.sifra == item["sifra"]).first() if item["sifra"] else None
    if not part:
        part = query.filter(func.lower(RezervniDio.naziv) == item["naziv"].lower()).first()

    action = "updated" if part else "created"
    if not part:
        part = RezervniDio(dobavljac_id=supplier.id)
        db.add(part)

    part.sifra = item["sifra"] or None
    part.naziv = item["naziv"]
    part.jedinica = item["jedinica"] or "kom"
    part.zaliha = item["zaliha"]
    part.cijena = item["cijena"]
    part.aktivan = True
    return action


def import_file(path: Path, supplier_key: str, parser, db) -> tuple[int, int]:
    supplier = get_supplier(db, supplier_key)
    created = 0
    updated = 0
    for item in parser(path):
        action = upsert_part(db, supplier, item)
        if action == "created":
            created += 1
        else:
            updated += 1
    return created, updated


def main():
    parser = argparse.ArgumentParser(description="Import spare parts from Cupup/Delt legacy XLS files.")
    parser.add_argument("--cupup", default="/Users/robertjovicic/Downloads/Cupup.xls")
    parser.add_argument("--delt", default="/Users/robertjovicic/Downloads/Delt.xls")
    args = parser.parse_args()

    ensure_additive_schema()
    db = SessionLocal()
    try:
        cupup_created, cupup_updated = import_file(Path(args.cupup), "cupup", rows_from_cupup, db)
        delt_created, delt_updated = import_file(Path(args.delt), "delt", rows_from_delt, db)
        db.commit()
        print(f"Cupup d.o.o: created={cupup_created}, updated={cupup_updated}")
        print(f"Delt papir d.o.o: created={delt_created}, updated={delt_updated}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
