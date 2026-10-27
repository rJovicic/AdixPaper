"""Shared PDF building blocks.

reportlab's built-in Helvetica only covers WinAnsi, so Croatian č, ć and đ printed as
empty boxes. Every PDF uses the bundled Liberation Sans (SIL OFL, see fonts/) instead.
"""
from functools import lru_cache
from pathlib import Path

FONTS_DIR = Path(__file__).resolve().parent / "fonts"
REGULAR = "LiberationSans"
BOLD = "LiberationSans-Bold"
BRAND_BLUE = "#2A59A2"
SHELL_DEEP = "#152C52"


@lru_cache(maxsize=1)
def register_fonts() -> tuple[str, str]:
    from reportlab.lib.fonts import addMapping
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    pdfmetrics.registerFont(TTFont(REGULAR, str(FONTS_DIR / "LiberationSans-Regular.ttf")))
    pdfmetrics.registerFont(TTFont(BOLD, str(FONTS_DIR / "LiberationSans-Bold.ttf")))
    # Lets <b> in Paragraph markup pick the bold face.
    addMapping(REGULAR, 0, 0, REGULAR)
    addMapping(REGULAR, 1, 0, BOLD)
    return REGULAR, BOLD


def stylesheet():
    """reportlab's sample styles switched to the bundled font."""
    from reportlab.lib.styles import getSampleStyleSheet

    regular, bold = register_fonts()
    styles = getSampleStyleSheet()
    for style in styles.byName.values():
        if not hasattr(style, "fontName"):
            continue  # list styles
        style.fontName = bold if "Bold" in style.fontName or style.name.startswith(("Title", "Heading")) else regular
    return styles
