from __future__ import annotations

from typing import Any


FIELD_LABELS_RU: dict[str, str] = {
    "dream_text": "текст сна",
    "full_name": "имя",
    "birth_date": "дата рождения",
    "birth_time": "время рождения",
    "birth_place": "место рождения",
    "name": "имя",
    "name1": "имя первого человека",
    "name2": "имя второго человека",
    "date1": "дата рождения первого человека",
    "date2": "дата рождения второго человека",
    "question": "вопрос",
    "topic": "тема",
    "spread": "расклад",
    "email": "email",
    "password": "пароль",
    "password_confirm": "подтверждение пароля",
    "code": "код подтверждения",
    "new_password": "новый пароль",
    "note": "заметка",
    "focus": "фокус запроса",
    "persona_name": "имя персоны",
    "persona_birth_date": "дата рождения персоны",
    "persona_birth_time": "время рождения персоны",
    "persona_birth_place": "место рождения персоны",
    "persona1_name": "имя первой персоны",
    "persona2_name": "имя второй персоны",
    "language": "язык",
    "subject": "тема обращения",
    "message": "сообщение",
}


def _field_label(loc: list[Any]) -> str:
    parts = [str(item) for item in loc if item not in {"body", "query", "path", "header", "cookie"}]
    if not parts:
        return "поле"
    key = parts[-1]
    if key.isdigit() and len(parts) >= 2:
        key = parts[-2]
    return FIELD_LABELS_RU.get(key, key.replace("_", " "))


def translate_validation_error(error: dict[str, Any]) -> str:
    error_type = str(error.get("type") or "")
    loc = list(error.get("loc") or [])
    label = _field_label(loc)
    ctx = error.get("ctx") if isinstance(error.get("ctx"), dict) else {}
    min_length = ctx.get("min_length")
    max_length = ctx.get("max_length")

    if error_type in {"missing", "value_error.missing"}:
        return f"Заполните поле «{label}»."
    if error_type in {"string_too_short", "too_short"}:
        if min_length is not None:
            return f"Поле «{label}» слишком короткое. Нужно минимум {min_length} символов."
        return f"Поле «{label}» слишком короткое."
    if error_type in {"string_too_long", "too_long"}:
        if max_length is not None:
            return f"Поле «{label}» слишком длинное. Максимум {max_length} символов."
        return f"Поле «{label}» слишком длинное."
    if error_type in {"string_type", "string_unicode", "string_pattern"}:
        return f"Проверьте поле «{label}» — введите корректный текст."
    if error_type in {"int_parsing", "int_type", "float_parsing", "float_type", "bool_parsing", "bool_type"}:
        return f"Проверьте поле «{label}» — указано неверное значение."
    if error_type in {"greater_than", "greater_than_equal", "less_than", "less_than_equal"}:
        return f"Проверьте поле «{label}» — значение вне допустимого диапазона."
    if error_type == "value_error":
        msg = str(error.get("msg") or "").strip()
        if msg and not msg.lower().startswith("value error"):
            return msg
        return f"Проверьте поле «{label}»."
    if error_type == "json_invalid":
        return "Некорректный формат данных. Обновите страницу и попробуйте снова."

    msg = str(error.get("msg") or "").strip()
    lowered = msg.lower()
    if "at least" in lowered and "character" in lowered:
        return f"Поле «{label}» слишком короткое. Нужно больше символов."
    if "at most" in lowered and "character" in lowered:
        return f"Поле «{label}» слишком длинное."
    if "field required" in lowered:
        return f"Заполните поле «{label}»."
    if msg and " " in msg and not msg.startswith("Value error"):
        # Prefer already-human messages; rewrite obvious English pydantic defaults.
        if "string" in lowered and "length" in lowered:
            return f"Проверьте длину поля «{label}»."
        return msg
    return f"Проверьте поле «{label}»."


def format_validation_errors(errors: list[dict[str, Any]]) -> str:
    messages = [translate_validation_error(error) for error in errors]
    unique: list[str] = []
    for message in messages:
        if message and message not in unique:
            unique.append(message)
    if not unique:
        return "Проверьте введённые данные."
    if len(unique) == 1:
        return unique[0]
    return "\n".join(f"• {item}" for item in unique)
