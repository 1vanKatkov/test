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


def _request_completion(
    messages: list[dict[str, str]],
    model: str,
    timeout_seconds: int,
    max_tokens: int | None,
) -> tuple[str, str | None]:
    payload: dict[str, Any] = {"model": model, "messages": messages}
    if isinstance(max_tokens, int) and max_tokens > 0:
        payload["max_tokens"] = max_tokens

    try:
        response = requests.post(
            settings.openrouter_url,
            headers={"Authorization": f"Bearer {settings.openrouter_api_key}"},
            json=payload,
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

    choice = choices[0] if isinstance(choices[0], dict) else {}
    content = (choice.get("message") or {}).get("content")
    if not content:
        raise HTTPException(status_code=502, detail="AI provider returned empty content")
    finish_reason = choice.get("finish_reason")
    return str(content), str(finish_reason) if finish_reason else None


def chat_completion(
    model: str,
    prompt: str,
    timeout_seconds: int = 60,
    max_tokens: int | None = None,
    system_prompt: str | None = None,
    max_continuations: int = 2,
) -> str:
    if not settings.openrouter_api_key:
        raise HTTPException(status_code=500, detail="OPENROUTER_API_KEY is not configured")

    messages: list[dict[str, str]] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    content, finish_reason = _request_completion(messages, model, timeout_seconds, max_tokens)
    full = content
    continuations = 0

    while finish_reason == "length" and continuations < max_continuations:
        continuations += 1
        messages.append({"role": "assistant", "content": full})
        messages.append(
            {
                "role": "user",
                "content": (
                    "Continue the previous response from exactly where it stopped. "
                    "Do not repeat earlier text. Keep the same language, tone, and Markdown structure."
                ),
            }
        )
        continuation, finish_reason = _request_completion(
            messages, model, timeout_seconds, max_tokens
        )
        full = f"{full.rstrip()}\n\n{continuation.lstrip()}"

    return full
