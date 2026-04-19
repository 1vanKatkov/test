from __future__ import annotations

import json
import re
from datetime import date, datetime
from pathlib import Path

from fastapi import HTTPException

from app.web.services.openrouter import chat_completion
from config import settings

MESSAGES_PATH = Path(settings.sovmestimost_messages_path)

RUSSIAN_LETTERS = {
    "А": 1,
    "Б": 2,
    "В": 3,
    "Г": 4,
    "Д": 5,
    "Е": 6,
    "Ё": 7,
    "Ж": 8,
    "З": 9,
    "И": 1,
    "Й": 2,
    "К": 3,
    "Л": 4,
    "М": 5,
    "Н": 6,
    "О": 7,
    "П": 8,
    "Р": 9,
    "С": 1,
    "Т": 2,
    "У": 3,
    "Ф": 4,
    "Х": 5,
    "Ц": 6,
    "Ч": 7,
    "Ш": 8,
    "Щ": 9,
    "Ъ": 1,
    "Ы": 2,
    "Ь": 3,
    "Э": 4,
    "Ю": 5,
    "Я": 6,
}
LATIN_LETTERS = {
    "A": 1,
    "B": 2,
    "C": 3,
    "D": 4,
    "E": 5,
    "F": 6,
    "G": 7,
    "H": 8,
    "I": 9,
    "J": 1,
    "K": 2,
    "L": 3,
    "M": 4,
    "N": 5,
    "O": 6,
    "P": 7,
    "Q": 8,
    "R": 9,
    "S": 1,
    "T": 2,
    "U": 3,
    "V": 4,
    "W": 5,
    "X": 6,
    "Y": 7,
    "Z": 8,
}


def _load_prompt(language: str, key: str) -> str:
    try:
        with MESSAGES_PATH.open("r", encoding="utf-8") as file_handle:
            content = json.load(file_handle)
        lang_block = content.get(language) or content.get("ru") or {}
        return lang_block.get(key, "")
    except Exception:
        if key == "prompt_names_dates_ai":
            return "{compatibility_data}"
        return "{expression_data}"


def _resolve_model(language: str) -> str:
    if (language or "").strip().lower() == "en":
        return settings.model_sovmestimost_en
    return settings.model_sovmestimost


def calculate_expression_number(name: str) -> int:
    total = 0
    for char in name.upper().strip():
        if char in RUSSIAN_LETTERS:
            total += RUSSIAN_LETTERS[char]
        elif char in LATIN_LETTERS:
            total += LATIN_LETTERS[char]
    while total > 9 and total not in (11, 22, 33):
        total = sum(int(digit) for digit in str(total))
    return total


def parse_date(value: str) -> date:
    normalized = re.sub(r"[.\-/]", ".", value.strip())
    try:
        return datetime.strptime(normalized, "%d.%m.%Y").date()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid date format. Use DD.MM.YYYY") from exc


def calculate_life_path_number(birth_date: date) -> int:
    total = sum(int(digit) for digit in birth_date.strftime("%d%m%Y"))
    while total > 9 and total not in (11, 22, 33):
        total = sum(int(digit) for digit in str(total))
    return total


def analyze_compatibility(expr1: int, expr2: int, path1: int, path2: int) -> dict:
    harmonious_pairs = [(1, 2), (2, 4), (3, 6), (4, 8), (5, 7)]
    conflict_pairs = [(1, 1), (3, 4)]

    def is_harmonious(a: int, b: int) -> bool:
        return (a, b) in harmonious_pairs or (b, a) in harmonious_pairs

    def is_conflict(a: int, b: int) -> bool:
        return (a, b) in conflict_pairs or (b, a) in conflict_pairs

    def is_karmic(a: int, b: int) -> bool:
        return abs(a - b) >= 5

    expr_compatibility = (
        "harmonious"
        if is_harmonious(expr1, expr2)
        else ("conflict" if is_conflict(expr1, expr2) else ("karmic" if is_karmic(expr1, expr2) else "neutral"))
    )
    path_compatibility = (
        "harmonious"
        if is_harmonious(path1, path2)
        else ("conflict" if is_conflict(path1, path2) else ("karmic" if is_karmic(path1, path2) else "neutral"))
    )
    return {
        "expr_compatibility": expr_compatibility,
        "path_compatibility": path_compatibility,
        "expr1": expr1,
        "expr2": expr2,
        "path1": path1,
        "path2": path2,
    }


def by_names(name1: str, name2: str, language: str = "ru") -> str:
    expr1 = calculate_expression_number(name1)
    expr2 = calculate_expression_number(name2)
    expression_data = f"Name 1: {name1}\nExpression number: {expr1}\nName 2: {name2}\nExpression number: {expr2}"
    prompt_template = _load_prompt(language, "prompt_names_only_ai")
    prompt = prompt_template.format(user_input=f"{name1} and {name2}", expression_data=expression_data)
    return chat_completion(_resolve_model(language), prompt)


def by_names_dates(name1: str, date1: str, name2: str, date2: str, language: str = "ru") -> str:
    first_date = parse_date(date1)
    second_date = parse_date(date2)
    expr1 = calculate_expression_number(name1)
    expr2 = calculate_expression_number(name2)
    path1 = calculate_life_path_number(first_date)
    path2 = calculate_life_path_number(second_date)
    compatibility = analyze_compatibility(expr1, expr2, path1, path2)
    compatibility_data = (
        f"Name1: {name1}\nBirth date1: {first_date.strftime('%d.%m.%Y')}\nExpression number1: {expr1}\nLife path number1: {path1}\n"
        f"Name2: {name2}\nBirth date2: {second_date.strftime('%d.%m.%Y')}\nExpression number2: {expr2}\nLife path number2: {path2}\n"
        f"Expression compatibility: {compatibility['expr_compatibility']}\nLife path compatibility: {compatibility['path_compatibility']}"
    )
    prompt_template = _load_prompt(language, "prompt_names_dates_ai")
    prompt = prompt_template.format(
        user_input=f"{name1}, {first_date.strftime('%d.%m.%Y')} and {name2}, {second_date.strftime('%d.%m.%Y')}",
        compatibility_data=compatibility_data,
    )
    return chat_completion(_resolve_model(language), prompt)

