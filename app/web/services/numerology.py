from __future__ import annotations

import sys
from datetime import date, datetime

from fastapi import HTTPException

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


def generate_web_report(full_name: str, birth_date: str) -> dict:
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

    return {
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

