from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qsl

from fastapi import Cookie, Header, HTTPException

from app.web.db import db
from config import settings


@dataclass
class TelegramIdentity:
    user_id: str
    username: str
    language: str
    internal_user_id: int
    init_data: str


def _secret() -> str:
    if settings.email_auth_secret:
        return settings.email_auth_secret
    if settings.max_auth_secret:
        return settings.max_auth_secret
    return "change-me-telegram-auth-secret"


def _encode_token(payload: dict[str, str | int]) -> str:
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    signature = hmac.new(_secret().encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{signature}"


def _decode_token(token: str) -> dict[str, str | int]:
    try:
        body, signature = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid Telegram auth token") from exc
    expected = hmac.new(_secret().encode(), body.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="Invalid Telegram auth token signature")
    padded = body + "=" * (-len(body) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid Telegram auth token payload") from exc
    expires_at = int(payload.get("exp", 0))
    if expires_at <= int(time.time()):
        raise HTTPException(status_code=401, detail="Telegram auth token expired")
    return payload


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


def issue_telegram_auth_token(identity: TelegramIdentity) -> str:
    now = int(time.time())
    return _encode_token(
        {
            "sub": identity.user_id,
            "exp": now + settings.email_auth_ttl_seconds,
            "iat": now,
        }
    )


def resolve_telegram_identity_by_token(token: str) -> TelegramIdentity:
    payload = _decode_token(token)
    provider_user_id = str(payload.get("sub", "")).strip()
    if not provider_user_id:
        raise HTTPException(status_code=401, detail="Invalid Telegram auth token subject")
    user = db.get_user_by_provider(provider="telegram", provider_user_id=provider_user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Telegram user not found")
    return TelegramIdentity(
        user_id=provider_user_id,
        username=user["username"] or f"telegram_{provider_user_id}",
        language=user["language"] or "ru",
        internal_user_id=user["id"],
        init_data="",
    )


async def require_telegram_auth(
    x_telegram_auth_token: str = Header(default="", alias="X-Telegram-Auth-Token"),
    x_telegram_init_data: str = Header(default="", alias="X-Telegram-Init-Data"),
    telegram_auth_token: str = Cookie(default="", alias="telegram_auth_token"),
) -> TelegramIdentity:
    token = x_telegram_auth_token or telegram_auth_token
    if token:
        try:
            return resolve_telegram_identity_by_token(token)
        except HTTPException:
            pass
    if not x_telegram_init_data:
        raise HTTPException(status_code=401, detail="Missing Telegram initData header")
    identity, _is_new = resolve_telegram_identity(x_telegram_init_data)
    return identity


async def optional_telegram_auth(
    x_telegram_auth_token: str = Header(default="", alias="X-Telegram-Auth-Token"),
    x_telegram_init_data: str = Header(default="", alias="X-Telegram-Init-Data"),
    telegram_auth_token: str = Cookie(default="", alias="telegram_auth_token"),
) -> TelegramIdentity | None:
    token = x_telegram_auth_token or telegram_auth_token
    if token:
        try:
            return resolve_telegram_identity_by_token(token)
        except HTTPException:
            pass
    if not x_telegram_init_data:
        return None
    try:
        identity, _is_new = resolve_telegram_identity(x_telegram_init_data)
        return identity
    except HTTPException:
        return None
