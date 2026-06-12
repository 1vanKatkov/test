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

from app.web.services.openrouter import chat_completion
from config import settings


TAROT_CARD_SYSTEM_PROMPTS = {
    "ru": """Ты таролог-консультант Astrolhub. Отвечай на русском языке мягко, ясно и структурно.
Таро используй как символический инструмент саморефлексии, а не как гарантированное предсказание. Не давай медицинских, юридических или финансовых инструкций.
Структура ответа: 1) общий смысл расклада; 2) значение каждой карты; 3) связка карт между собой; 4) практичный совет на ближайшее время.""",
    "en": """You are Astrolhub's tarot advisor. Reply in English in a warm, clear, structured way.
Use tarot as a symbolic self-reflection tool, not as guaranteed prediction. Do not provide medical, legal, or financial instructions.
Response structure: 1) overall spread meaning; 2) each card meaning; 3) how the cards connect; 4) practical near-term advice.""",
}

THREE_CARD_SPREAD = {
    "size": 3,
    "ru": "Три карты",
    "en": "Three cards",
    "positions_ru": ["Прошлое", "Настоящее", "Ближайший вектор"],
    "positions_en": ["Past", "Present", "Near-term direction"],
}

SPREADS = {"three_cards": THREE_CARD_SPREAD}

MAJOR_ARCANA = [
    ("fool", "Шут", "The Fool"),
    ("magician", "Маг", "The Magician"),
    ("high_priestess", "Верховная Жрица", "The High Priestess"),
    ("empress", "Императрица", "The Empress"),
    ("emperor", "Император", "The Emperor"),
    ("hierophant", "Иерофант", "The Hierophant"),
    ("lovers", "Влюблённые", "The Lovers"),
    ("chariot", "Колесница", "The Chariot"),
    ("strength", "Сила", "Strength"),
    ("hermit", "Отшельник", "The Hermit"),
    ("wheel_of_fortune", "Колесо Фортуны", "Wheel of Fortune"),
    ("justice", "Справедливость", "Justice"),
    ("hanged_man", "Повешенный", "The Hanged Man"),
    ("death", "Смерть", "Death"),
    ("temperance", "Умеренность", "Temperance"),
    ("devil", "Дьявол", "The Devil"),
    ("tower", "Башня", "The Tower"),
    ("star", "Звезда", "The Star"),
    ("moon", "Луна", "The Moon"),
    ("sun", "Солнце", "The Sun"),
    ("judgement", "Суд", "Judgement"),
    ("world", "Мир", "The World"),
]

SUITS = {
    "wands": {"ru": "Жезлы", "en": "Wands", "symbol": "♣"},
    "cups": {"ru": "Кубки", "en": "Cups", "symbol": "♥"},
    "swords": {"ru": "Мечи", "en": "Swords", "symbol": "♠"},
    "pentacles": {"ru": "Пентакли", "en": "Pentacles", "symbol": "♦"},
}

RANKS = [
    ("ace", "Туз", "Ace"),
    ("two", "Двойка", "Two"),
    ("three", "Тройка", "Three"),
    ("four", "Четвёрка", "Four"),
    ("five", "Пятёрка", "Five"),
    ("six", "Шестёрка", "Six"),
    ("seven", "Семёрка", "Seven"),
    ("eight", "Восьмёрка", "Eight"),
    ("nine", "Девятка", "Nine"),
    ("ten", "Десятка", "Ten"),
    ("page", "Паж", "Page"),
    ("knight", "Рыцарь", "Knight"),
    ("queen", "Королева", "Queen"),
    ("king", "Король", "King"),
]


def _build_deck() -> list[dict[str, Any]]:
    deck: list[dict[str, Any]] = []
    for index, (slug, name_ru, name_en) in enumerate(MAJOR_ARCANA):
        deck.append(
            {
                "id": f"major_{slug}",
                "number": index,
                "arcana": "major",
                "suit": "",
                "rank": "",
                "symbol": "✦",
                "name_ru": name_ru,
                "name_en": name_en,
            }
        )
    for suit_id, suit in SUITS.items():
        for rank_id, rank_ru, rank_en in RANKS:
            deck.append(
                {
                    "id": f"{suit_id}_{rank_id}",
                    "number": "",
                    "arcana": "minor",
                    "suit": suit_id,
                    "rank": rank_id,
                    "symbol": suit["symbol"],
                    "name_ru": f"{rank_ru} {suit['ru']}",
                    "name_en": f"{rank_en} of {suit['en']}",
                }
            )
    return deck


DECK = _build_deck()
DECK_BY_ID = {card["id"]: card for card in DECK}
DRAW_TOKEN_TTL_SECONDS = 15 * 60
_RUNTIME_DRAW_SECRET = secrets.token_urlsafe(32)


def public_deck(language: str = "ru") -> list[dict[str, Any]]:
    lang = "en" if language == "en" else "ru"
    return [_public_card(card, lang) for card in DECK]


def spread_options(language: str = "ru") -> list[dict[str, Any]]:
    lang = "en" if language == "en" else "ru"
    return [
        {"id": spread_id, "title": data[lang], "size": data["size"]}
        for spread_id, data in SPREADS.items()
    ]


def _public_card(card: dict[str, Any], language: str) -> dict[str, Any]:
    return {
        "id": card["id"],
        "name": card["name_en"] if language == "en" else card["name_ru"],
        "arcana": card["arcana"],
        "suit": card["suit"],
        "rank": card["rank"],
        "symbol": card["symbol"],
        "number": card["number"],
    }


def _validate_spread(spread: str) -> dict[str, Any]:
    normalized = (spread or "three_cards").strip()
    if normalized != "three_cards":
        raise HTTPException(status_code=400, detail="Invalid tarot spread")
    return {"id": "three_cards", **THREE_CARD_SPREAD}


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


def validate_draw_token(draw_token: str, spread: str = "three_cards") -> list[str]:
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
    spread_data = _validate_spread(spread)
    if payload.get("spread") != spread_data["id"]:
        raise HTTPException(status_code=400, detail="Invalid tarot draw")
    card_ids = payload.get("cards") or []
    if not isinstance(card_ids, list):
        raise HTTPException(status_code=400, detail="Invalid tarot draw")
    return _validated_card_ids(card_ids, int(spread_data["size"]))


def _validated_card_ids(card_ids: list[Any], size: int) -> list[str]:
    ids = [str(card_id).strip() for card_id in card_ids if str(card_id).strip()]
    if len(ids) != size:
        raise HTTPException(status_code=400, detail=f"Choose exactly {size} cards")
    if len(set(ids)) != len(ids):
        raise HTTPException(status_code=400, detail="Cards must be unique")
    missing = [card_id for card_id in ids if card_id not in DECK_BY_ID]
    if missing:
        raise HTTPException(status_code=400, detail="Invalid tarot card")
    return ids


def _select_cards(spread_data: dict[str, Any], selected_card_ids: list[str] | None, language: str) -> list[dict[str, Any]]:
    size = int(spread_data["size"])
    ids = [str(card_id).strip() for card_id in (selected_card_ids or []) if str(card_id).strip()]
    if ids:
        ids = _validated_card_ids(ids, size)
        cards = [DECK_BY_ID[card_id] for card_id in ids]
    else:
        cards = random.sample(DECK, size)
    positions = spread_data["positions_en"] if language == "en" else spread_data["positions_ru"]
    return [
        {**_public_card(card, language), "position": positions[index] if index < len(positions) else str(index + 1)}
        for index, card in enumerate(cards)
    ]


def draw_three_cards(spread: str = "three_cards", language: str = "ru") -> dict[str, Any]:
    lang = "en" if language == "en" else "ru"
    spread_data = _validate_spread(spread)
    cards = _select_cards(spread_data, None, lang)
    card_ids = [card["id"] for card in cards]
    draw_token = _sign_draw_payload(
        {
            "cards": card_ids,
            "exp": int(time.time()) + DRAW_TOKEN_TTL_SECONDS,
            "spread": spread_data["id"],
        }
    )
    return {
        "spread": {"id": spread_data["id"], "title": spread_data[lang], "size": spread_data["size"]},
        "cards": cards,
        "draw_token": draw_token,
    }


def _build_prompt(question: str, spread_data: dict[str, Any], cards: list[dict[str, Any]], language: str) -> str:
    spread_title = spread_data["en"] if language == "en" else spread_data["ru"]
    card_lines = "\n".join(
        f"{index + 1}. {card['position']}: {card['name']} ({card['arcana']})"
        for index, card in enumerate(cards)
    )
    if language == "en":
        return (
            f"Question/context: {question or 'General tarot reading'}\n"
            f"Spread: {spread_title}\nCards:\n{card_lines}\n\n"
            "Give a structured tarot interpretation in Markdown headings and bullet points."
        )
    return (
        f"Вопрос/контекст: {question or 'Общий расклад Таро'}\n"
        f"Расклад: {spread_title}\nКарты:\n{card_lines}\n\n"
        "Дай структурированный разбор Таро с Markdown-заголовками и списками."
    )


def tarot_card_reading(
    question: str,
    spread: str,
    language: str = "ru",
    selected_card_ids: list[str] | None = None,
) -> dict[str, Any]:
    lang = "en" if language == "en" else "ru"
    spread_data = _validate_spread(spread)
    cards = _select_cards(spread_data, selected_card_ids, lang)
    model = settings.model_tarot_en if lang == "en" else settings.model_tarot
    interpretation = chat_completion(
        model,
        _build_prompt(question.strip(), spread_data, cards, lang),
        timeout_seconds=75,
        max_tokens=1600,
        system_prompt=TAROT_CARD_SYSTEM_PROMPTS[lang],
    )
    return {
        "spread": {"id": spread_data["id"], "title": spread_data[lang], "size": spread_data["size"]},
        "cards": cards,
        "interpretation": interpretation,
    }
