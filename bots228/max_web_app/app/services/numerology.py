import shutil
import sys
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException

from app.config import NUMEROLOGY_DIR, REPORTS_DIR

if str(NUMEROLOGY_DIR) not in sys.path:
    sys.path.insert(0, str(NUMEROLOGY_DIR))

try:
    from report_generator import generate_numerology_report_pdf  # type: ignore
except ImportError as exc:
    raise RuntimeError(f"Failed to import numerology report generator: {exc}") from exc


def parse_birth_date(date_str: str):
    try:
        return datetime.strptime(date_str.strip(), "%d.%m.%Y").date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid date format. Use DD.MM.YYYY") from exc


def generate_report(user_id: int, full_name: str, birth_date: str) -> Path:
    birth_date_obj = parse_birth_date(birth_date)
    base_report_path = generate_numerology_report_pdf(user_id, full_name, birth_date_obj)
    if not base_report_path.exists():
        raise HTTPException(status_code=500, detail="Numerology report generation failed")

    unique_name = f"numerology_{user_id}_{uuid4().hex}.pdf"
    destination = REPORTS_DIR / unique_name
    shutil.copyfile(base_report_path, destination)
    return destination
