from app.config import MODEL_SONNIK
from app.services.openrouter import chat_completion


def interpret_dream(dream_text: str) -> str:
    prompt = dream_text.strip()
    return chat_completion(MODEL_SONNIK, prompt)
