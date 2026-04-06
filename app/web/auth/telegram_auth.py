from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qsl

from fastapi import Header, HTTPException

from app.web.db import db
from config import settings


@dataclass
class TelegramIdentity:
    user_id: str
    username: str
    language: str
    internal_user_id: int
    init_data: str


def _parse_init_data(init_data: str) -> dict[str, str]:
    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    if "hash" not in pairs:
        raise HTTPException(status_code=401, detail="Telegram initData hash is missing")
    return pairs


def _build_data_check_string(data: dict[str, str]) -> str:
    parts = []
    for key in sorted(data.keys()):
        if key == "hash":
            continue
        parts.append(f"{key}={data[key]}")
    return "\n".join(parts)


def _verify_init_data_signature(data: dict[str, str]) -> None:
    if not settings.telegram_bot_token:
        raise HTTPException(status_code=500, detail="TELEGRAM_BOT_TOKEN is not configured")

    data_check_string = _build_data_check_string(data)
    secret_key = hmac.new(
        b"WebAppData",
        settings.telegram_bot_token.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    expected_hash = hmac.new(
        secret_key,
        data_check_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    received_hash = data["hash"]
    if not hmac.compare_digest(expected_hash, received_hash):
        raise HTTPException(status_code=401, detail="Telegram initData signature is invalid")


def _verify_auth_date(data: dict[str, str]) -> None:
    auth_date = data.get("auth_date")
    if not auth_date:
        raise HTTPException(status_code=401, detail="Telegram auth_date is missing")
    try:
        auth_ts = int(auth_date)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Telegram auth_date is invalid") from exc

    now = int(time.time())
    if abs(now - auth_ts) > settings.telegram_auth_skew_seconds:
        raise HTTPException(status_code=401, detail="Telegram auth data is expired")


def _extract_user(data: dict[str, str]) -> dict[str, Any]:
    user_raw = data.get("user")
    if not user_raw:
        raise HTTPException(status_code=401, detail="Telegram user payload is missing")
    try:
        user_data = json.loads(user_raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=401, detail="Telegram user payload is invalid") from exc
    if "id" not in user_data:
        raise HTTPException(status_code=401, detail="Telegram user id is missing")
    return user_data


def resolve_telegram_identity(init_data: str) -> tuple[TelegramIdentity, bool]:
    data = _parse_init_data(init_data)
    _verify_init_data_signature(data)
    _verify_auth_date(data)
    tg_user = _extract_user(data)

    provider_user_id = str(tg_user["id"])
    username = tg_user.get("username") or tg_user.get("first_name") or f"telegram_{provider_user_id}"
    language = tg_user.get("language_code") or "ru"

    existing = db.get_user_by_provider(provider="telegram", provider_user_id=provider_user_id)
    user = db.get_or_create_user(
        provider="telegram",
        provider_user_id=provider_user_id,
        username=username,
        language=language,
    )
    return (
        TelegramIdentity(
            user_id=provider_user_id,
            username=user["username"],
            language=user["language"],
            internal_user_id=user["id"],
            init_data=init_data,
        ),
        existing is None,
    )


async def require_telegram_auth(
    x_telegram_init_data: str = Header(default="", alias="X-Telegram-Init-Data"),
) -> TelegramIdentity:
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Missing Telegram initData header")
    identity, _is_new = resolve_telegram_identity(x_telegram_init_data)
    return identity


async def optional_telegram_auth(
    x_telegram_init_data: str = Header(default="", alias="X-Telegram-Init-Data"),
) -> TelegramIdentity | None:
    if not x_telegram_init_data:
        return None
    try:
        identity, _is_new = resolve_telegram_identity(x_telegram_init_data)
        return identity
    except HTTPException:
        return None
