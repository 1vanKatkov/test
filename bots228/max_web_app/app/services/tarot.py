import random
from typing import List

from app.config import MODEL_TAROT
from app.services.openrouter import chat_completion


MAJOR_ARCANA = [
    "The Fool", "The Magician", "The High Priestess", "The Empress", "The Emperor",
    "The Hierophant", "The Lovers", "The Chariot", "Strength", "The Hermit",
    "Wheel of Fortune", "Justice", "The Hanged Man", "Death", "Temperance",
    "The Devil", "The Tower", "The Star", "The Moon", "The Sun",
    "Judgement", "The World",
]


def draw_cards(spread_size: int) -> List[str]:
    if spread_size not in (1, 3):
        raise ValueError("Supported spreads are 1 or 3 cards")
    return random.sample(MAJOR_ARCANA, spread_size)


def tarot_reading(question: str, spread_size: int, language: str = "ru") -> dict:
    cards = draw_cards(spread_size)
    card_list = ", ".join(cards)
    prompt = (
        "Give a structured tarot reading.\n"
        f"Language: {language}\n"
        f"Question: {question}\n"
        f"Spread size: {spread_size}\n"
        f"Cards: {card_list}\n"
        "Write with practical guidance and clear sections."
    )
    interpretation = chat_completion(MODEL_TAROT, prompt)
    return {"cards": cards, "interpretation": interpretation}
