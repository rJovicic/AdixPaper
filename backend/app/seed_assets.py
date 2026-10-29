"""Initial machine and components: AMICA MATRIX and its 13 components (owner's list, 2026-10-30).

Run by hand, never on startup:

    python -m app.seed_assets                      # dry run: prints what would change, writes nothing
    python -m app.seed_assets --apply              # local / staging database
    python -m app.seed_assets --apply --confirm-database <name>   # required where APP_ENV/Railway say production

Idempotent and conservative:
- the machine is matched by name, ignoring case and spacing; two candidates = ambiguity, nothing is written;
- each component is matched by name within that machine; an existing one is left as it is, except
  that an empty model or manufacturer is filled in; a different non-empty value is reported as a
  conflict and kept;
- inventory and serial numbers are never written (the real values are not known yet), and faults,
  QR identifiers and other fields are never touched.
"""
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from .models import KomponentaOpreme, Oprema

MACHINE = "AMICA MATRIX"
# (component, model, manufacturer) exactly as supplied; only whitespace is normalised.
# Spellings are kept as given ("AKOMULATOR", "PALIETIZING"): correcting them is the owner's call.
COMPONENTS = [
    ("ODMOTAČ 1", "BS 2601", "PCMC"),
    ("ODMOTAČ 2", "BS 2602", "PCMC"),
    ("ODMOTAČ 3", "BS 2603", "PCMC"),
    ("JEDINICA ZA UTISKIVANJE", "NT 6000", "PCMC"),
    ("NAMATAČ", "Amica Matrix", "PCMC"),
    ("UREĐAJ ZA LJEPLJENJE", "ROTOSEAL 45", "PCMC"),
    ("AKOMULATOR LOGOVA", "A 300", "PCMC"),
    ("REZAČ ROLA", "PROLOG LT", "PCMC"),
    ("UREĐAJ ZA LJEPLJENJE PAPIRNIH CIJEVI", "TDS", "PCMC"),
    ("STROJ ZA POJEDINAČNO PAKIRANJE", "ROLL BAGGER MAESTRA", "STAX TECHNOLOGIES"),
    ("STROJ ZA SKUPNO PAKIRANJE", "ROLL BUNDLER FORZA", "STAX TECHNOLOGIES"),
    ("SISTEM PALETIZACIJE I ROBOT", "PALIETIZING SYSTEM", "STAX TECHNOLOGIES"),
    ("STROJ ZA OMATANJE PALETA", "STRETCH WRAPPER RSW 70", "STAX TECHNOLOGIES"),
]


def _clean(value: str) -> str:
    return " ".join(value.split())


def _key(value: str | None) -> str:
    return _clean(value or "").casefold()


@dataclass
class SeedReport:
    applied: bool
    machine: str = ""  # "created" | "existing" | "ambiguous"
    created: list = field(default_factory=list)
    filled: list = field(default_factory=list)
    unchanged: list = field(default_factory=list)
    conflicts: list = field(default_factory=list)
    ambiguous: list = field(default_factory=list)
    notes: list = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.machine != "ambiguous" and not self.ambiguous

    def lines(self) -> list[str]:
        out = [f"{'APPLIED' if self.applied else 'DRY RUN (nothing written)'} · machine {MACHINE}: {self.machine}"]
        for title, items in (("created", self.created), ("filled empty model/manufacturer", self.filled),
                             ("unchanged", self.unchanged), ("CONFLICT, kept as is", self.conflicts),
                             ("AMBIGUOUS, skipped", self.ambiguous), ("note", self.notes)):
            out += [f"  {title}: {item}" for item in items]
        return out


def seed_amica_matrix(db: Session, apply: bool = False) -> SeedReport:
    report = SeedReport(applied=apply)
    candidates = [m for m in db.query(Oprema).all() if _key(m.naziv) == _key(MACHINE)]
    if len(candidates) > 1:
        report.machine = "ambiguous"
        report.notes.append(f"{len(candidates)} machines are named {MACHINE} (ids {', '.join(str(m.id) for m in candidates)}); resolve by hand")
        report.applied = False
        db.rollback()
        return report
    component_keys = {_key(name) for name, _, _ in COMPONENTS}
    lookalikes = [m for m in db.query(Oprema).all() if _key(m.naziv) in component_keys]
    for m in lookalikes:
        report.notes.append(f"a top-level machine #{m.id} '{m.naziv}' has a component's name; it was not merged or changed")

    if candidates:
        machine = candidates[0]
        report.machine = "existing"
    else:
        machine = Oprema(naziv=MACHINE)
        db.add(machine)
        db.flush()
        report.machine = "created"

    existing = {}
    for component in db.query(KomponentaOpreme).filter(KomponentaOpreme.oprema_id == machine.id).all():
        existing.setdefault(_key(component.naziv), []).append(component)

    for name, model, maker in COMPONENTS:
        name, model, maker = _clean(name), _clean(model), _clean(maker)
        matches = existing.get(_key(name), [])
        if len(matches) > 1:
            report.ambiguous.append(f"{name}: {len(matches)} components with this name on {MACHINE}")
            continue
        if not matches:
            db.add(KomponentaOpreme(oprema_id=machine.id, naziv=name, model=model, proizvodac=maker, aktivna=True))
            report.created.append(f"{name} ({model}, {maker})")
            continue
        component = matches[0]
        changes = []
        for attr, wanted in (("model", model), ("proizvodac", maker)):
            current = getattr(component, attr)
            if not (current or "").strip():
                setattr(component, attr, wanted)
                changes.append(f"{attr}={wanted}")
            elif _key(current) != _key(wanted):
                report.conflicts.append(f"{name}: {attr} is '{current}', list says '{wanted}'")
        (report.filled if changes else report.unchanged).append(f"{name}{' (' + ', '.join(changes) + ')' if changes else ''}")

    if apply and report.ok:
        db.commit()
    else:
        db.rollback()
        report.applied = False
    return report


def _describe_target() -> str:
    from .database import engine

    url = engine.url
    return f"{url.get_backend_name()} database '{url.database}' on host '{url.host or 'local file/socket'}'"


def main(argv=None) -> int:
    from .config import is_production
    from .database import SessionLocal, engine

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="write the changes (default: dry run)")
    parser.add_argument("--confirm-database", help="the target database's name; required to --apply in production")
    args = parser.parse_args(argv)

    print(f"Target: {_describe_target()}")
    if args.apply and is_production() and args.confirm_database != engine.url.database:
        print("Refused: this is a production environment. Re-run with --confirm-database <that database's name> once the target is confirmed.")
        return 2
    db = SessionLocal()
    try:
        report = seed_amica_matrix(db, apply=args.apply)
    finally:
        db.close()
    print("\n".join(report.lines()))
    return 0 if report.ok else 1


if __name__ == "__main__":
    sys.exit(main())
