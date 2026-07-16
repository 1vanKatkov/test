from __future__ import annotations

from app.web.services.natal_chart import build_natal_chart_from_persona, format_natal_chart_for_prompt


def _normalize_lang(language: str) -> str:
    return "en" if (language or "").strip().lower() == "en" else "ru"


def format_persona_for_prompt(persona: dict | None, language: str = "ru") -> str:
    if not persona:
        return "No persona data provided." if _normalize_lang(language) == "en" else "Данные персоны не переданы."
    if _normalize_lang(language) == "en":
        return (
            f"Name: {persona.get('name') or 'not provided'}\n"
            f"Birth date: {persona.get('birth_date') or 'not provided'}\n"
            f"Birth time: {persona.get('birth_time') or 'not provided'}\n"
            f"Birth place: {persona.get('birth_place') or 'not provided'}\n"
            f"User note: {persona.get('note') or 'not provided'}"
        )
    return (
        f"Имя: {persona.get('name') or 'не указано'}\n"
        f"Дата рождения: {persona.get('birth_date') or 'не указана'}\n"
        f"Время рождения: {persona.get('birth_time') or 'не указано'}\n"
        f"Место рождения: {persona.get('birth_place') or 'не указано'}\n"
        f"Заметка пользователя: {persona.get('note') or 'не указана'}"
    )


def format_persona_context_block(
    persona: dict | None,
    language: str = "ru",
    *,
    include_chart: bool = False,
    label: str = "",
) -> str:
    lang = _normalize_lang(language)
    title = label or ("Persona context" if lang == "en" else "Контекст персоны")
    lines = [
        f"{title}:",
        "---BEGIN PERSONA CONTEXT---",
        format_persona_for_prompt(persona, lang),
        "---END PERSONA CONTEXT---",
    ]
    if include_chart and persona:
        chart = build_natal_chart_from_persona(persona)
        chart_block = format_natal_chart_for_prompt(chart, lang)
        if chart_block:
            lines.extend(
                [
                    "",
                    "Computed natal chart:" if lang == "en" else "Рассчитанная натальная карта:",
                    "---BEGIN NATAL CHART---",
                    chart_block,
                    "---END NATAL CHART---",
                ]
            )
        else:
            lines.append(
                "Computed natal chart: unavailable."
                if lang == "en"
                else "Рассчитанная натальная карта: недоступна."
            )
    return "\n".join(lines)
