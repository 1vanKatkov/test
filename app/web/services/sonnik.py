from __future__ import annotations

from app.web.services.openrouter import chat_completion
from config import settings


def _resolve_model(language: str) -> str:
    if (language or "").strip().lower() == "en":
        return settings.model_sonnik_en
    return settings.model_sonnik


def interpret_dream(dream_text: str, language: str = "ru") -> str:
    prompt = dream_text.strip()
    return chat_completion(_resolve_model(language), prompt)

