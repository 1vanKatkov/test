from __future__ import annotations

from typing import Any

import requests
from fastapi import HTTPException

from config import settings


def _extract_provider_error_detail(response: requests.Response) -> str:
    try:
        data: Any = response.json()
    except ValueError:
        text = (response.text or "").strip()
        return text[:300] if text else f"AI provider status {response.status_code}"

    if isinstance(data, dict):
        error_block = data.get("error")
        if isinstance(error_block, dict):
            message = error_block.get("message")
            if isinstance(message, str) and message.strip():
                return message.strip()
        detail = data.get("detail")
        if isinstance(detail, str) and detail.strip():
            return detail.strip()
        message = data.get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()

    return f"AI provider status {response.status_code}"


def chat_completion(model: str, prompt: str, timeout_seconds: int = 60) -> str:
    if not settings.openrouter_api_key:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY is not configured")

    try:
        response = requests.post(
            settings.openrouter_url,
            headers={"Authorization": f"Bearer {settings.openrouter_api_key}"},
            json={"model": model, "messages": [{"role": "user", "content": prompt}]},
            timeout=timeout_seconds,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"AI provider request failed: {exc}") from exc

    if response.status_code != 200:
        provider_detail = _extract_provider_error_detail(response)
        raise HTTPException(status_code=502, detail=provider_detail)

    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="AI provider returned invalid JSON") from exc

    choices = data.get("choices") if isinstance(data, dict) else None
    if not choices:
        raise HTTPException(status_code=502, detail="AI provider returned no choices")

    content = (choices[0].get("message") or {}).get("content")
    if not content:
        raise HTTPException(status_code=502, detail="AI provider returned empty content")
    return content

