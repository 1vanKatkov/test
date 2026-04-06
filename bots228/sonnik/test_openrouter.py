"""Проверка работоспособности OpenRouter API."""
import os
import requests
from pathlib import Path
from dotenv import load_dotenv

# Загружаем .env из папки sonnik
load_dotenv(Path(__file__).resolve().parent / ".env")

API_KEY = os.getenv("OPENROUTER_API_KEY")
if not API_KEY:
    print("OPENROUTER_API_KEY не найден в .env или окружении")
    exit(1)

URL = "https://openrouter.ai/api/v1/chat/completions"
headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

# 1) Тест на стандартной модели
print("--- Тест: openai/gpt-4o-mini ---")
resp = requests.post(
    URL,
    headers=headers,
    json={
        "model": "openai/gpt-4o-mini",
        "messages": [{"role": "user", "content": "Ответь одним словом: ок"}],
    },
    timeout=60,
)
print("Status:", resp.status_code)
print("Body:", resp.text[:1500])
if resp.status_code != 200:
    exit(1)

# 2) Тест пресета сонника (как в боте)
print("\n--- Тест: @preset/sonnik ---")
resp2 = requests.post(
    URL,
    headers=headers,
    json={
        "model": "@preset/sonnik",
        "messages": [{"role": "user", "content": "Тест"}],
    },
    timeout=60,
)
print("Status:", resp2.status_code)
print("Body:", resp2.text[:1500])
