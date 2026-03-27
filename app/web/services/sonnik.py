from __future__ import annotations

from app.web.services.openrouter import chat_completion
from config import settings


def interpret_dream(dream_text: str) -> str:
    prompt = dream_text.strip()
    return chat_completion(settings.model_sonnik, prompt)

