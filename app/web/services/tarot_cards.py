from __future__ import annotations

import base64
import hashlib
import hmac
import json
import random
import secrets
import time
from typing import Any

from fastapi import HTTPException

from app.web.db import db
from app.web.services.openrouter import chat_completion
from app.web.services.persona_prompt import format_persona_context_block
from config import settings


TAROT_CARD_SYSTEM_PROMPTS = {
    "ru": """Ты таролог-консультант Astrolhub. Работаешь с классической колодой Райдера—Уэйта (78 карт).
Отвечай на русском мягко, ясно и структурно. Используй ТОЛЬКО переданные из базы значения карт как основу интерпретации; не выдумывай противоречащие им смыслы.
Таро — инструмент саморефлексии, не гарантированное предсказание. Не давай медицинских, юридических или финансовых инструкций.
Если есть контекст персоны — мягко персонализируй, не раскрывая лишние детали.

Структура ответа в Markdown:
## Ваш расклад
Краткое введение (1 абзац).

Затем для каждой карты:
### Карта N. {позиция}
**Карта:** {название}
Описание по позиции (2–3 абзаца), опираясь на ключевые слова, свет/тень и релевантную сферу.

## Общий вывод
2–3 абзаца о связке карт.

## Практический совет
Что делать в ближайшие дни (конкретно, 1 абзац + 2–4 пункта).""",
    "en": """You are Astrolhub's tarot advisor using the classic Rider-Waite deck (78 cards).
Reply in English warmly, clearly, and with structure. Use ONLY the provided database card meanings as the basis; do not invent contradictory meanings.
Tarot is a self-reflection tool, not guaranteed prediction. Do not give medical, legal, or financial instructions.
If persona context is provided, personalize gently without exposing unnecessary details.

Markdown structure:
## Your spread
Brief intro (1 paragraph).

Then for each card:
### Card N. {position}
**Card:** {name}
Position-focused description (2–3 paragraphs) using keywords, light/shadow, and the relevant life area.

## Overall conclusion
2–3 paragraphs on how the cards connect.

## Practical advice
What to do in the coming days (one paragraph + 2–4 concrete bullets).""",
}


TOPIC_DEFINITIONS: dict[str, dict[str, Any]] = {
    "relationships": {
        "icon": "❤️",
        "ru": "Отношения",
        "en": "Relationships",
        "spread_id": "relationships_5",
        "size": 5,
        "positions_ru": [
            "Ваши чувства",
            "Его/её чувства",
            "Что между вами сейчас",
            "Главный урок отношений",
            "Куда движется ситуация",
        ],
        "positions_en": [
            "Your feelings",
            "Their feelings",
            "What is between you now",
            "The main relationship lesson",
            "Where the situation is heading",
        ],
        "needs_partner_name": True,
        "needs_question": False,
        "subtopics": [
            {"id": "what_they_feel", "ru": "Что он/она чувствует?", "en": "What do they feel?"},
            {"id": "prospects", "ru": "Перспективы отношений", "en": "Relationship prospects"},
            {"id": "conflicts", "ru": "Причина конфликтов", "en": "Reason for conflicts"},
            {"id": "potential", "ru": "Потенциал пары", "en": "Couple potential"},
            {"id": "full", "ru": "Полный анализ", "en": "Full analysis"},
        ],
        "focus_field": "love",
    },
    "money": {
        "icon": "💰",
        "ru": "Деньги",
        "en": "Money",
        "spread_id": "money_5",
        "size": 5,
        "positions_ru": [
            "Ваше текущее положение",
            "Что привлекает деньги",
            "Что блокирует рост",
            "Возможность периода",
            "Совет",
        ],
        "positions_en": [
            "Your current position",
            "What attracts money",
            "What blocks growth",
            "Opportunity of the period",
            "Advice",
        ],
        "needs_partner_name": False,
        "needs_question": False,
        "subtopics": [],
        "focus_field": "finances",
    },
    "career": {
        "icon": "💼",
        "ru": "Карьера",
        "en": "Career",
        "spread_id": "career_5",
        "size": 5,
        "positions_ru": [
            "Где вы сейчас",
            "Ваша сильная сторона",
            "Что мешает росту",
            "Возможность периода",
            "Совет",
        ],
        "positions_en": [
            "Where you are now",
            "Your strength",
            "What blocks growth",
            "Opportunity of the period",
            "Advice",
        ],
        "needs_partner_name": False,
        "needs_question": False,
        "subtopics": [],
        "focus_field": "career",
    },
    "personal_path": {
        "icon": "🌙",
        "ru": "Личный путь",
        "en": "Personal path",
        "spread_id": "personal_5",
        "size": 5,
        "positions_ru": [
            "Ваше текущее состояние",
            "Скрытый ресурс",
            "Урок периода",
            "Куда ведёт путь",
            "Совет",
        ],
        "positions_en": [
            "Your current state",
            "Hidden resource",
            "Lesson of the period",
            "Where the path leads",
            "Advice",
        ],
        "needs_partner_name": False,
        "needs_question": False,
        "subtopics": [],
        "focus_field": "growth",
    },
    "question": {
        "icon": "🔮",
        "ru": "Ответ на вопрос",
        "en": "Answer a question",
        "spread_id": "question_3",
        "size": 3,
        "positions_ru": ["Текущая ситуация", "Что влияет на ситуацию", "Совет"],
        "positions_en": ["Current situation", "What influences the situation", "Advice"],
        "needs_partner_name": False,
        "needs_question": True,
        "question_examples_ru": [
            "Что происходит в моих отношениях?",
            "Стоит ли менять работу?",
            "Почему ситуация не двигается?",
            "Что мне важно понять сейчас?",
        ],
        "question_examples_en": [
            "What is happening in my relationship?",
            "Should I change jobs?",
            "Why is the situation stuck?",
            "What do I need to understand now?",
        ],
        "subtopics": [],
        "focus_field": "general",
    },
    "card_of_day": {
        "icon": "📅",
        "ru": "Карта дня",
        "en": "Card of the day",
        "spread_id": "card_of_day",
        "size": 1,
        "positions_ru": ["Карта дня"],
        "positions_en": ["Card of the day"],
        "needs_partner_name": False,
        "needs_question": False,
        "subtopics": [],
        "focus_field": "general",
        "day_mode": True,
    },
    "month_full": {
        "icon": "⭐",
        "ru": "Полный расклад месяца",
        "en": "Full monthly spread",
        "spread_id": "month_7",
        "size": 7,
        "positions_ru": [
            "Общий фон месяца",
            "Любовь и отношения",
            "Деньги",
            "Карьера",
            "Личный рост",
            "Предупреждение",
            "Главный совет месяца",
        ],
        "positions_en": [
            "Overall tone of the month",
            "Love and relationships",
            "Money",
            "Career",
            "Personal growth",
            "Warning",
            "Main advice for the month",
        ],
        "needs_partner_name": False,
        "needs_question": False,
        "subtopics": [],
        "focus_field": "general",
    },
}

DRAW_TOKEN_TTL_SECONDS = 15 * 60
_RUNTIME_DRAW_SECRET = secrets.token_urlsafe(32)


def _lang(language: str) -> str:
    return "en" if language == "en" else "ru"


def _row_to_card(row: Any) -> dict[str, Any]:
    return {key: row[key] for key in row.keys()}


def _deck_rows() -> list[dict[str, Any]]:
    rows = db.list_tarot_cards()
    if len(rows) < 78:
        raise HTTPException(status_code=503, detail="Tarot deck is not ready")
    return [_row_to_card(row) for row in rows]


def _deck_by_id() -> dict[str, dict[str, Any]]:
    return {card["id"]: card for card in _deck_rows()}


def topic_options(language: str = "ru") -> list[dict[str, Any]]:
    lang = _lang(language)
    options: list[dict[str, Any]] = []
    for topic_id, data in TOPIC_DEFINITIONS.items():
        options.append(
            {
                "id": topic_id,
                "icon": data["icon"],
                "title": data[lang],
                "spread_id": data["spread_id"],
                "size": data["size"],
                "needs_partner_name": bool(data.get("needs_partner_name")),
                "needs_question": bool(data.get("needs_question")),
                "day_mode": bool(data.get("day_mode")),
                "question_examples": data.get(f"question_examples_{lang}", []),
                "subtopics": [
                    {"id": item["id"], "title": item[lang]}
                    for item in data.get("subtopics", [])
                ],
                "positions": data[f"positions_{lang}"],
            }
        )
    return options


def public_deck(language: str = "ru") -> list[dict[str, Any]]:
    lang = _lang(language)
    return [_public_card(card, lang) for card in _deck_rows()]


def spread_options(language: str = "ru") -> list[dict[str, Any]]:
    lang = _lang(language)
    return [
        {
            "id": data["spread_id"],
            "topic_id": topic_id,
            "title": data[lang],
            "size": data["size"],
        }
        for topic_id, data in TOPIC_DEFINITIONS.items()
    ]


def _card_image_url(card_id: str) -> str:
    return f"/static/img/tarot/cards/{card_id}.png"


def _public_card(card: dict[str, Any], language: str, include_meanings: bool = False) -> dict[str, Any]:
    lang = _lang(language)
    payload = {
        "id": card["id"],
        "name": card[f"name_{lang}"],
        "arcana": card["arcana"],
        "suit": card.get("suit") or "",
        "rank": card.get("rank") or "",
        "symbol": card.get("symbol") or "✦",
        "number": card.get("number"),
        "keywords": card[f"keywords_{lang}"],
        "image_url": _card_image_url(card["id"]),
    }
    if include_meanings:
        payload.update(
            {
                "light": card[f"light_{lang}"],
                "shadow": card[f"shadow_{lang}"],
                "love": card[f"love_{lang}"],
                "finances": card[f"finances_{lang}"],
                "career": card[f"career_{lang}"],
                "growth": card[f"growth_{lang}"],
                "symbolism": card[f"symbolism_{lang}"],
                "advice": card[f"advice_{lang}"],
            }
        )
    return payload


def _resolve_topic(topic: str) -> tuple[str, dict[str, Any]]:
    topic_id = (topic or "").strip()
    if topic_id not in TOPIC_DEFINITIONS:
        # Backward compatibility with older three-card spread id.
        if topic_id in {"", "three_cards", "question_3"}:
            topic_id = "question"
        elif topic_id in {data["spread_id"] for data in TOPIC_DEFINITIONS.values()}:
            topic_id = next(key for key, data in TOPIC_DEFINITIONS.items() if data["spread_id"] == topic_id)
        else:
            raise HTTPException(status_code=400, detail="Invalid tarot topic")
    return topic_id, TOPIC_DEFINITIONS[topic_id]


def _spread_from_topic(topic_data: dict[str, Any], topic_id: str) -> dict[str, Any]:
    return {
        "id": topic_data["spread_id"],
        "topic_id": topic_id,
        "size": topic_data["size"],
        "ru": topic_data["ru"],
        "en": topic_data["en"],
        "positions_ru": topic_data["positions_ru"],
        "positions_en": topic_data["positions_en"],
        "focus_field": topic_data.get("focus_field") or "general",
        "day_mode": bool(topic_data.get("day_mode")),
    }


def _draw_secret() -> bytes:
    configured_secret = (settings.email_auth_secret or settings.telegram_link_secret or "").strip()
    secret = configured_secret if len(configured_secret) >= 32 else _RUNTIME_DRAW_SECRET
    return secret.encode("utf-8")


def _b64_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64_decode(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode((raw + padding).encode("ascii"))


def _sign_draw_payload(payload: dict[str, Any]) -> str:
    encoded_payload = _b64_encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signature = hmac.new(_draw_secret(), encoded_payload.encode("ascii"), hashlib.sha256).digest()
    return f"{encoded_payload}.{_b64_encode(signature)}"


def validate_draw_token(draw_token: str, topic: str = "question") -> list[str]:
    token = (draw_token or "").strip()
    if not token or "." not in token:
        raise HTTPException(status_code=400, detail="Tarot draw is required")
    encoded_payload, encoded_signature = token.split(".", 1)
    expected_signature = hmac.new(_draw_secret(), encoded_payload.encode("ascii"), hashlib.sha256).digest()
    try:
        provided_signature = _b64_decode(encoded_signature)
        payload = json.loads(_b64_decode(encoded_payload).decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid tarot draw")
    if not hmac.compare_digest(provided_signature, expected_signature):
        raise HTTPException(status_code=400, detail="Invalid tarot draw")
    if int(payload.get("exp") or 0) < int(time.time()):
        raise HTTPException(status_code=400, detail="Tarot draw expired")
    topic_id, topic_data = _resolve_topic(topic)
    spread_data = _spread_from_topic(topic_data, topic_id)
    token_topic = payload.get("topic") or ""
    token_spread = payload.get("spread") or ""
    allowed = {topic_id, spread_data["id"], "three_cards"}
    if token_topic not in allowed and token_spread not in allowed:
        raise HTTPException(status_code=400, detail="Invalid tarot draw")
    card_ids = payload.get("cards") or []
    if not isinstance(card_ids, list):
        raise HTTPException(status_code=400, detail="Invalid tarot draw")
    return _validated_card_ids(card_ids, int(spread_data["size"]))


def _validated_card_ids(card_ids: list[Any], size: int) -> list[str]:
    deck_map = _deck_by_id()
    ids = [str(card_id).strip() for card_id in card_ids if str(card_id).strip()]
    if len(ids) != size:
        raise HTTPException(status_code=400, detail=f"Choose exactly {size} cards")
    if len(set(ids)) != len(ids):
        raise HTTPException(status_code=400, detail="Cards must be unique")
    missing = [card_id for card_id in ids if card_id not in deck_map]
    if missing:
        raise HTTPException(status_code=400, detail="Invalid tarot card")
    return ids


def _select_cards(
    spread_data: dict[str, Any],
    selected_card_ids: list[str] | None,
    language: str,
) -> list[dict[str, Any]]:
    lang = _lang(language)
    size = int(spread_data["size"])
    deck_map = _deck_by_id()
    ids = [str(card_id).strip() for card_id in (selected_card_ids or []) if str(card_id).strip()]
    if ids:
        ids = _validated_card_ids(ids, size)
        cards = [deck_map[card_id] for card_id in ids]
    else:
        cards = random.sample(list(deck_map.values()), size)
    positions = spread_data["positions_en"] if lang == "en" else spread_data["positions_ru"]
    result: list[dict[str, Any]] = []
    for index, card in enumerate(cards):
        public = _public_card(card, lang, include_meanings=True)
        public["position"] = positions[index] if index < len(positions) else str(index + 1)
        result.append(public)
    return result


def draw_cards(topic: str = "question", language: str = "ru") -> dict[str, Any]:
    lang = _lang(language)
    topic_id, topic_data = _resolve_topic(topic)
    spread_data = _spread_from_topic(topic_data, topic_id)
    cards = _select_cards(spread_data, None, lang)
    card_ids = [card["id"] for card in cards]
    draw_token = _sign_draw_payload(
        {
            "cards": card_ids,
            "exp": int(time.time()) + DRAW_TOKEN_TTL_SECONDS,
            "topic": topic_id,
            "spread": spread_data["id"],
        }
    )
    return {
        "topic": {"id": topic_id, "title": topic_data[lang]},
        "spread": {
            "id": spread_data["id"],
            "title": topic_data[lang],
            "size": spread_data["size"],
            "positions": spread_data[f"positions_{lang}"],
        },
        "cards": cards,
        "draw_token": draw_token,
    }


def draw_three_cards(spread: str = "three_cards", language: str = "ru") -> dict[str, Any]:
    """Backward-compatible wrapper for older clients."""
    topic = "question" if spread in {"", "three_cards", "question_3"} else spread
    return draw_cards(topic=topic, language=language)


def _focus_excerpt(card: dict[str, Any], focus_field: str) -> str:
    if focus_field == "love":
        return card.get("love") or ""
    if focus_field == "finances":
        return card.get("finances") or ""
    if focus_field == "career":
        return card.get("career") or ""
    if focus_field == "growth":
        return card.get("growth") or ""
    return ""


def _build_prompt(
    question: str,
    spread_data: dict[str, Any],
    cards: list[dict[str, Any]],
    language: str,
    persona: dict | None = None,
    partner_name: str = "",
    subtopic: str = "",
    topic_title: str = "",
) -> str:
    lang = _lang(language)
    focus_field = spread_data.get("focus_field") or "general"
    card_blocks: list[str] = []
    for index, card in enumerate(cards, start=1):
        focus_text = _focus_excerpt(card, focus_field)
        focus_line = ""
        if focus_text:
            label = {
                "love": "Любовь" if lang == "ru" else "Love",
                "finances": "Финансы" if lang == "ru" else "Finances",
                "career": "Карьера" if lang == "ru" else "Career",
                "growth": "Саморазвитие" if lang == "ru" else "Self-development",
            }.get(focus_field, "")
            if label:
                focus_line = f"\n{label}: {focus_text}"
        if lang == "en":
            card_blocks.append(
                f"{index}. Position: {card['position']}\n"
                f"Card: {card['name']} ({card['arcana']})\n"
                f"Keywords: {card.get('keywords') or ''}\n"
                f"Light: {card.get('light') or ''}\n"
                f"Shadow: {card.get('shadow') or ''}"
                f"{focus_line}\n"
                f"Symbolism: {card.get('symbolism') or ''}\n"
                f"Advice: {card.get('advice') or ''}"
            )
        else:
            card_blocks.append(
                f"{index}. Позиция: {card['position']}\n"
                f"Карта: {card['name']} ({card['arcana']})\n"
                f"Ключевые слова: {card.get('keywords') or ''}\n"
                f"Светлые проявления: {card.get('light') or ''}\n"
                f"Теневые проявления: {card.get('shadow') or ''}"
                f"{focus_line}\n"
                f"Символика: {card.get('symbolism') or ''}\n"
                f"Совет: {card.get('advice') or ''}"
            )

    persona_section = (
        f"\n\n{format_persona_context_block(persona, language, include_chart=False)}\n"
        if persona
        else ""
    )
    partner_line = ""
    if partner_name.strip():
        partner_line = (
            f"Partner name: {partner_name.strip()}\n"
            if lang == "en"
            else f"Имя партнёра: {partner_name.strip()}\n"
        )
    subtopic_line = ""
    if subtopic.strip():
        subtopic_line = (
            f"Focus within topic: {subtopic.strip()}\n"
            if lang == "en"
            else f"Уточнение запроса: {subtopic.strip()}\n"
        )

    if spread_data.get("day_mode"):
        if lang == "en":
            return (
                f"Topic: Card of the day\n"
                f"Card data from database:\n{card_blocks[0]}\n"
                f"{persona_section}\n"
                "Write a Card of the Day reading with sections:\n"
                "## Your card of the day\n## Description\n## Focus of the day\n## Advice of the day\n## Affirmation of the day\n"
                "Keep it inspiring, concrete, and grounded in the provided card meanings."
            )
        return (
            f"Тема: Карта дня\n"
            f"Данные карты из базы:\n{card_blocks[0]}\n"
            f"{persona_section}\n"
            "Напиши расклад «Карта дня» с разделами:\n"
            "## Ваша карта дня\n## Описание\n## Фокус дня\n## Совет дня\n## Аффирмация дня\n"
            "Сделай текст вдохновляющим, конкретным и строго опирайся на переданные значения карты."
        )

    if lang == "en":
        return (
            f"Topic: {topic_title or spread_data['en']}\n"
            f"{subtopic_line}"
            f"{partner_line}"
            f"Question/context: {question or 'General Rider-Waite reading'}\n"
            f"Spread: {spread_data['en']} ({spread_data['size']} cards)\n"
            f"Card data from database (use as source of truth):\n"
            f"{chr(10).join(card_blocks)}"
            f"{persona_section}\n\n"
            "Interpret using the provided meanings. Follow the required Markdown structure."
        )
    return (
        f"Тема: {topic_title or spread_data['ru']}\n"
        f"{subtopic_line}"
        f"{partner_line}"
        f"Вопрос/контекст: {question or 'Общий расклад Райдера—Уэйта'}\n"
        f"Расклад: {spread_data['ru']} ({spread_data['size']} карт)\n"
        f"Данные карт из базы (источник истины для интерпретации):\n"
        f"{chr(10).join(card_blocks)}"
        f"{persona_section}\n\n"
        "Интерпретируй строго опираясь на переданные значения. Соблюдай требуемую Markdown-структуру."
    )


def tarot_card_reading(
    question: str,
    spread: str = "question",
    language: str = "ru",
    selected_card_ids: list[str] | None = None,
    persona: dict | None = None,
    partner_name: str = "",
    subtopic: str = "",
    topic: str = "",
) -> dict[str, Any]:
    lang = _lang(language)
    topic_id, topic_data = _resolve_topic(topic or spread)
    spread_data = _spread_from_topic(topic_data, topic_id)
    if topic_data.get("needs_question") and not (question or "").strip():
        raise HTTPException(status_code=400, detail="Question is required")
    cards = _select_cards(spread_data, selected_card_ids, lang)
    model = settings.model_tarot_en if lang == "en" else settings.model_tarot
    max_tokens = 2200 if spread_data["size"] >= 5 else 1600
    if spread_data.get("day_mode"):
        max_tokens = 1200
    interpretation = chat_completion(
        model,
        _build_prompt(
            question.strip(),
            spread_data,
            cards,
            lang,
            persona=persona,
            partner_name=partner_name,
            subtopic=subtopic,
            topic_title=topic_data[lang],
        ),
        timeout_seconds=90,
        max_tokens=max_tokens,
        system_prompt=TAROT_CARD_SYSTEM_PROMPTS[lang],
    )
    return {
        "topic": {"id": topic_id, "title": topic_data[lang]},
        "spread": {
            "id": spread_data["id"],
            "title": topic_data[lang],
            "size": spread_data["size"],
            "positions": spread_data[f"positions_{lang}"],
        },
        "cards": cards,
        "interpretation": interpretation,
        "partner_name": partner_name.strip(),
        "subtopic": subtopic.strip(),
        "question": question.strip(),
    }
