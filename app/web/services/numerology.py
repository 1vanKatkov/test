from __future__ import annotations

import json
import re
import sys
from datetime import date, datetime

from fastapi import HTTPException

from app.web.services.openrouter import chat_completion
from config import settings


def _load_numerology_texts():
    if str(settings.numerology_dir) not in sys.path:
        sys.path.insert(0, str(settings.numerology_dir))
    try:
        from numbers_desc import (  # type: ignore
            action_number_meanings,
            character_numbers,
            consciousness_number_meanings,
            destiny_number_meanings,
            energy_numbers,
            matrix_energies,
        )
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="Numerology module is not installed on server (numbers_desc not found)",
        ) from exc
    return (
        consciousness_number_meanings,
        destiny_number_meanings,
        action_number_meanings,
        character_numbers,
        energy_numbers,
        matrix_energies,
    )


def parse_birth_date(date_str: str) -> date:
    try:
        return datetime.strptime(date_str.strip(), "%d.%m.%Y").date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid date format. Use DD.MM.YYYY") from exc


def reduce_number(value: int) -> int:
    if value in (11, 22, 33):
        return value
    while value > 9:
        value = sum(int(d) for d in str(value))
        if value in (11, 22, 33):
            break
    return value


NUMEROLOGY_TABLE = {
    "А": 1, "И": 1, "С": 1, "Ъ": 1,
    "Б": 2, "Й": 2, "Т": 2, "Ы": 2,
    "В": 3, "К": 3, "У": 3, "Ь": 3,
    "Г": 4, "Л": 4, "Ф": 4, "Э": 4,
    "Д": 5, "М": 5, "Х": 5, "Ю": 5,
    "Е": 6, "Н": 6, "Ц": 6, "Я": 6,
    "Ё": 7, "О": 7, "Ч": 7,
    "Ж": 8, "П": 8, "Ш": 8,
    "З": 9, "Р": 9, "Щ": 9,
}


def calculate_consciousness_number(birth_date: date) -> int:
    return reduce_number(birth_date.day)


def calculate_destiny_number(birth_date: date) -> int:
    total = sum(int(d) for d in birth_date.strftime("%d%m%Y"))
    return reduce_number(total)


def calculate_action_number(full_name: str) -> int | None:
    total = 0
    for char in full_name.upper():
        if char in NUMEROLOGY_TABLE:
            total += NUMEROLOGY_TABLE[char]
    if total == 0:
        return None
    return reduce_number(total)


def calculate_character_number(birth_date: date) -> int:
    return reduce_number(birth_date.day)


def calculate_energy_number(birth_date: date) -> int:
    return reduce_number(birth_date.month)


def calculate_psychomatrix(birth_date: date) -> dict[str, int]:
    date_str = birth_date.strftime("%d%m%Y")
    matrix = {str(i): 0 for i in range(1, 10)}
    for digit in date_str:
        if digit != "0":
            matrix[digit] += 1
    return matrix


def _extract_json_payload(raw_text: str) -> dict | None:
    text = (raw_text or "").strip()
    if not text:
        return None
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    try:
        payload = json.loads(text)
        return payload if isinstance(payload, dict) else None
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        return None
    try:
        payload = json.loads(match.group(0))
        return payload if isinstance(payload, dict) else None
    except json.JSONDecodeError:
        return None


def _contains_cyrillic_text(value, parent_key: str = "") -> bool:
    if isinstance(value, dict):
        return any(_contains_cyrillic_text(item, str(key)) for key, item in value.items())
    if isinstance(value, list):
        return any(_contains_cyrillic_text(item, parent_key) for item in value)
    if not isinstance(value, str):
        return False
    # Names can legitimately be entered in Cyrillic; report text itself must be translated.
    if parent_key == "full_name":
        return False
    return bool(re.search(r"[А-Яа-яЁё]", value))


def _require_english_translation(translated: dict | None) -> dict | None:
    if not translated:
        return None
    if _contains_cyrillic_text(translated):
        return None
    return translated


def _translation_models() -> list[str]:
    candidates = [
        settings.model_sonnik_en,
        settings.model_sovmestimost_en,
        settings.model_sonnik,
        settings.model_sovmestimost,
    ]
    models: list[str] = []
    for model in candidates:
        if model and model not in models:
            models.append(model)
    return models


def _translate_report_payload_to_english(report_payload: dict) -> dict:
    """Translate numerology report textual values to English."""
    serialized_payload = json.dumps(report_payload, ensure_ascii=False, separators=(",", ":"))
    prompt = (
        "Translate every Russian text VALUE in this JSON to natural English.\n"
        "Keep JSON structure and keys exactly unchanged.\n"
        "Do not change numbers, dates, IDs, booleans, nulls, or array ordering.\n"
        "Do not leave any Cyrillic text in values except personal names in full_name.\n"
        "Output ONLY valid JSON without markdown.\n\n"
        f"{serialized_payload}"
    )
    retry_prompt = (
        "Return strictly valid JSON only. No explanations.\n"
        "Translate ALL Russian text values to English and preserve all keys exactly as-is.\n"
        "There must be no Cyrillic characters in JSON string values, except in full_name.\n\n"
        f"{serialized_payload}"
    )
    for model in _translation_models():
        translated_raw = chat_completion(model, prompt, timeout_seconds=120, max_tokens=12000)
        translated = _require_english_translation(_extract_json_payload(translated_raw))
        if translated:
            translated["language"] = "en"
            return translated
        translated_raw = chat_completion(model, retry_prompt, timeout_seconds=120, max_tokens=12000)
        translated = _require_english_translation(_extract_json_payload(translated_raw))
        if translated:
            translated["language"] = "en"
            return translated
    raise HTTPException(status_code=502, detail="Numerology English translation failed")


def _normalize_language(language: str = "") -> str:
    return "en" if (language or "").strip().lower() == "en" else "ru"


def translate_report_payload(report_payload: dict, language: str = "ru") -> dict:
    target_language = _normalize_language(language)
    if target_language != "en":
        report_payload["language"] = "ru"
        return report_payload
    return _translate_report_payload_to_english(report_payload)


def generate_web_report(full_name: str, birth_date: str, language: str = "ru") -> dict:
    birth_date_obj = parse_birth_date(birth_date)
    (
        consciousness_number_meanings,
        destiny_number_meanings,
        action_number_meanings,
        character_numbers,
        energy_numbers,
        matrix_energies,
    ) = _load_numerology_texts()

    consciousness = calculate_consciousness_number(birth_date_obj)
    destiny = calculate_destiny_number(birth_date_obj)
    action = calculate_action_number(full_name)
    character = calculate_character_number(birth_date_obj)
    energy = calculate_energy_number(birth_date_obj)
    psychomatrix = calculate_psychomatrix(birth_date_obj)

    innate_energies: list[dict] = []
    missing_energies: list[dict] = []
    for energy_item in matrix_energies:
        number = str(energy_item.get("number"))
        item_payload = {
            "number": number,
            "title": energy_item.get("title", ""),
            "description": energy_item.get("description", ""),
        }
        if psychomatrix.get(number, 0) > 0:
            innate_energies.append(item_payload)
        else:
            missing_energies.append(item_payload)

    report_payload = {
        "full_name": full_name,
        "birth_date": birth_date_obj.strftime("%d.%m.%Y"),
        "numbers": {
            "consciousness": consciousness,
            "destiny": destiny,
            "action": action,
            "character": character,
            "energy": energy,
        },
        "sections": {
            "consciousness": consciousness_number_meanings.get(consciousness, {}),
            "destiny": destiny_number_meanings.get(destiny, {}),
            "action": action_number_meanings.get(action, {}) if action is not None else {},
            "character_text": character_numbers.get(character, ""),
            "energy_text": energy_numbers.get(energy, ""),
        },
        "matrix": psychomatrix,
        "innate_energies": innate_energies,
        "missing_energies": missing_energies,
    }
    return translate_report_payload(report_payload, language)

