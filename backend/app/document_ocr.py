"""OCR-based capture for invoice/receipt photos.

Unlike app/payment_gateway.py or app/einvoice.py, this doesn't need a paid
external account - Tesseract is a real, free, offline OCR engine. It's
still an optional system dependency though (the Tesseract binary itself,
not just the Python bindings), so this fails closed with a clear message
when it isn't installed, the same convention as every other externally-
gated integration in this app. See WINDOWS_INSTALL.md for the one-line
install command.

Deliberately mirrors app/change_requests.py's voice-note pattern: this
never creates or edits an invoice/expense by itself. It only returns
best-effort extracted text and a rough line-item guess for a human to
review and correct before anything is submitted through the normal
create_invoice / create expense endpoints - OCR misreads on a financial
document (a "1" read as "7", a missing decimal point) are exactly the
kind of silent error this app's maker-checker patterns exist to catch
elsewhere, and text extracted from a photo deserves no more trust than a
value a user typed in themselves.
"""
import io
import os
import re
import shutil

from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image

router = APIRouter(prefix="/api/document-ocr", tags=["Document OCR"])

LINE_ITEM_PATTERN = re.compile(
    r"^(?P<description>.+?)\s+(?P<quantity>\d+(?:[.,]\d+)?)\s*[x×*]\s*"
    r"(?P<unit_price>[\d,.]+)\s*=?\s*(?P<total>[\d,.]+)?$"
)
TRAILING_AMOUNT_PATTERN = re.compile(r"^(?P<description>.+?)\s+(?P<amount>[\d,.]{3,})$")


def _tesseract_command() -> str:
    return os.getenv("VETRIX_TESSERACT_CMD", "tesseract").strip() or "tesseract"


def _tesseract_available() -> bool:
    return shutil.which(_tesseract_command()) is not None


def _require_tesseract():
    if not _tesseract_available():
        raise HTTPException(
            status_code=503,
            detail=(
                "OCR engine not installed. Install Tesseract OCR (e.g. "
                "'choco install tesseract' on Windows, or download from "
                "https://github.com/UB-Mannheim/tesseract/wiki) and restart "
                "the backend. Set VETRIX_TESSERACT_CMD if it isn't on PATH."
            ),
        )


def _parse_line_items(raw_text: str) -> list[dict]:
    items = []
    for line in raw_text.splitlines():
        line = line.strip()
        if not line or len(line) < 3:
            continue
        match = LINE_ITEM_PATTERN.match(line)
        if match:
            groups = match.groupdict()
            items.append({
                "description": groups["description"].strip(),
                "quantity": groups["quantity"].replace(",", "."),
                "unit_price": groups["unit_price"].replace(",", ""),
                "total": (groups.get("total") or "").replace(",", "") or None,
                "confidence": "line_pattern",
            })
            continue
        fallback = TRAILING_AMOUNT_PATTERN.match(line)
        if fallback:
            groups = fallback.groupdict()
            items.append({
                "description": groups["description"].strip(),
                "quantity": None,
                "unit_price": None,
                "total": groups["amount"].replace(",", ""),
                "confidence": "amount_guess",
            })
    return items


@router.get("/status")
def ocr_status():
    return {"available": _tesseract_available(), "command": _tesseract_command()}


@router.post("/extract")
async def extract_document(file: UploadFile = File(...)):
    _require_tesseract()
    import pytesseract

    pytesseract.pytesseract.tesseract_cmd = _tesseract_command()

    contents = await file.read()
    if len(contents) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image is too large (max 15MB)")

    try:
        image = Image.open(io.BytesIO(contents))
        image.load()
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read this file as an image")

    try:
        raw_text = pytesseract.image_to_string(image, lang="fas+eng")
    except pytesseract.TesseractError:
        # The Persian ("fas") language pack may not be installed even when
        # the engine itself is - fall back to English-only rather than
        # failing the whole request.
        raw_text = pytesseract.image_to_string(image, lang="eng")

    return {
        "raw_text": raw_text,
        "suggested_items": _parse_line_items(raw_text),
        "note": "Machine-read draft - review every field before creating a real record.",
    }
