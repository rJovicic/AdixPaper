"""Photo attachments: accept common camera formats, store a bounded, re-encoded JPEG.

Re-encoding (rather than storing the upload) means only pixels are kept: EXIF metadata such as
GPS position is dropped, malformed or disguised files are rejected, and every stored photo is
small enough to keep in the database.
"""
from io import BytesIO

from fastapi import HTTPException
from PIL import Image, ImageOps, UnidentifiedImageError

MAX_UPLOAD_BYTES = 12 * 1024 * 1024
MAX_PIXELS = 50_000_000  # ~ a 50 MP camera; larger is refused before decoding
MAX_EDGE = 1600
JPEG_QUALITY = 82
ACCEPTED_FORMATS = {"JPEG", "PNG", "WEBP", "MPO"}  # MPO: some phones' JPEG variant


def reencode_photo(raw: bytes) -> tuple[bytes, int, int]:
    """Returns (jpeg_bytes, width, height) or raises 400/413."""
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Fotografija je prevelika (najviše 12 MB)")
    try:
        with Image.open(BytesIO(raw)) as probe:
            if probe.format not in ACCEPTED_FORMATS:
                raise HTTPException(status_code=400, detail="Dopuštene su samo fotografije (JPEG, PNG, WebP)")
            if probe.width * probe.height > MAX_PIXELS:
                raise HTTPException(status_code=413, detail="Fotografija je prevelika (najviše 12 MB)")
            probe.verify()
        with Image.open(BytesIO(raw)) as image:
            image = ImageOps.exif_transpose(image)
            image = image.convert("RGB")
            image.thumbnail((MAX_EDGE, MAX_EDGE))
            out = BytesIO()
            image.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
            return out.getvalue(), image.width, image.height
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as error:
        raise HTTPException(status_code=400, detail="Dopuštene su samo fotografije (JPEG, PNG, WebP)") from error
