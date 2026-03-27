from __future__ import annotations

import shutil
import sys
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException

from config import settings


def _load_report_generator():
    if str(settings.numerology_dir) not in sys.path:
        sys.path.insert(0, str(settings.numerology_dir))
    try:
        from report_generator import generate_numerology_report_pdf  # type: ignore
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="Numerology module is not installed on server (report_generator not found)",
        ) from exc
    return generate_numerology_report_pdf


def parse_birth_date(date_str: str):
    try:
        return datetime.strptime(date_str.strip(), "%d.%m.%Y").date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid date format. Use DD.MM.YYYY") from exc


def generate_report(user_id: int, full_name: str, birth_date: str) -> Path:
    birth_date_obj = parse_birth_date(birth_date)
    report_fn = _load_report_generator()
    base_report_path = report_fn(user_id, full_name, birth_date_obj)
    if not base_report_path.exists():
        raise HTTPException(status_code=500, detail="Numerology report generation failed")

    unique_name = f"numerology_{user_id}_{uuid4().hex}.pdf"
    destination = settings.reports_dir / unique_name
    shutil.copyfile(base_report_path, destination)
    return destination

