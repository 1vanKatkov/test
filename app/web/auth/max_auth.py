from __future__ import annotations

import hashlib
import hmac
import time
from dataclasses import dataclass

from fastapi import Header, HTTPException, Request

from app.web.db import db
from config import settings


@dataclass
class MaxIdentity:
    user_id: str
    username: str
    language: str
    internal_user_id: int


def _payload_digest(raw_body: bytes) -> str:
    return hashlib.sha256(raw_body).hexdigest()


def _sign(user_id: str, timestamp: str, nonce: str, body_digest: str, secret: str) -> str:
    message = f"{user_id}:{timestamp}:{nonce}:{body_digest}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def verify_max_signature(
    user_id: str,
    timestamp: str,
    nonce: str,
    signature: str,
    body_digest: str,
) -> None:
    if not settings.max_auth_secret:
        raise HTTPException(status_code=500, detail="MAX_AUTH_SECRET is not configured")

    try:
        ts = int(timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid auth timestamp") from exc

    now = int(time.time())
    if abs(now - ts) > settings.max_auth_skew_seconds:
        raise HTTPException(status_code=401, detail="Auth timestamp expired")

    expected = _sign(
        user_id=user_id,
        timestamp=timestamp,
        nonce=nonce,
        body_digest=body_digest,
        secret=settings.max_auth_secret,
    )
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="Invalid auth signature")


async def require_max_auth(
    request: Request,
    x_max_user_id: str = Header(default="", alias="X-Max-User-Id"),
    x_max_timestamp: str = Header(default="", alias="X-Max-Timestamp"),
    x_max_nonce: str = Header(default="", alias="X-Max-Nonce"),
    x_max_signature: str = Header(default="", alias="X-Max-Signature"),
    x_max_username: str = Header(default="", alias="X-Max-Username"),
    x_max_language: str = Header(default="ru", alias="X-Max-Language"),
) -> MaxIdentity:
    if not x_max_user_id or not x_max_timestamp or not x_max_signature:
        raise HTTPException(status_code=401, detail="Missing Max auth headers")

    raw_body = await request.body()
    body_digest = _payload_digest(raw_body)
    verify_max_signature(
        user_id=x_max_user_id,
        timestamp=x_max_timestamp,
        nonce=x_max_nonce,
        signature=x_max_signature,
        body_digest=body_digest,
    )

    user = db.get_or_create_user(
        provider="max",
        provider_user_id=x_max_user_id,
        username=x_max_username or f"max_{x_max_user_id}",
        language=x_max_language or "ru",
    )
    return MaxIdentity(
        user_id=x_max_user_id,
        username=user["username"],
        language=user["language"],
        internal_user_id=user["id"],
    )

