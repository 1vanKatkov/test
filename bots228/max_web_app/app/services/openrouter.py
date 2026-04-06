from typing import Optional

import requests
from fastapi import HTTPException

from app.config import OPENROUTER_API_KEY, OPENROUTER_URL


def chat_completion(model: str, prompt: str, timeout_seconds: int = 60) -> str:
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY is not configured")

    try:
        response = requests.post(
            OPENROUTER_URL,
            headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"},
            json={"model": model, "messages": [{"role": "user", "content": prompt}]},
            timeout=timeout_seconds,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"AI provider request failed: {exc}") from exc

    if response.status_code != 200:
        raise HTTPException(status_code=502, detail=f"AI provider status {response.status_code}")

    data = response.json()
    choices = data.get("choices") if isinstance(data, dict) else None
    if not choices:
        raise HTTPException(status_code=502, detail="AI provider returned no choices")

    content = (choices[0].get("message") or {}).get("content")
    if not content:
        raise HTTPException(status_code=502, detail="AI provider returned empty content")
    return content
