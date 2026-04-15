from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import Cookie, Header, HTTPException

from app.web.db import db
from config import settings
def _now() -> str:
    return datetime.now(timezone.utc).isoformat()




@dataclass
class EmailIdentity:
    user_id: str
    username: str
    language: str
    internal_user_id: int


def _secret() -> str:
    if settings.email_auth_secret:
        return settings.email_auth_secret
    if settings.max_auth_secret:
        return settings.max_auth_secret
    return "change-me-email-auth-secret"


def _hash_password(password: str, salt: bytes | None = None) -> str:
    salt_bytes = salt or os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_bytes, 120_000)
    return f"{base64.b64encode(salt_bytes).decode()}${base64.b64encode(digest).decode()}"


def _verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt_b64, digest_b64 = stored_hash.split("$", 1)
        salt = base64.b64decode(salt_b64.encode())
        expected = base64.b64decode(digest_b64.encode())
    except Exception:
        return False
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return hmac.compare_digest(actual, expected)


def _encode_token(payload: dict) -> str:
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")
    signature = hmac.new(_secret().encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{signature}"


def _decode_token(token: str) -> dict:
    try:
        body, signature = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid email auth token") from exc
    expected = hmac.new(_secret().encode(), body.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="Invalid email auth token signature")
    padded = body + "=" * (-len(body) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid email auth token payload") from exc
    expires_at = int(payload.get("exp", 0))
    if expires_at <= int(time.time()):
        raise HTTPException(status_code=401, detail="Email auth token expired")
    return payload


def _build_identity(email: str) -> EmailIdentity:
    row = db.get_user_by_provider(provider="email", provider_user_id=email)
    if not row:
        raise HTTPException(status_code=401, detail="Email user not found")
    return EmailIdentity(
        user_id=email,
        username=row["username"] or email,
        language=row["language"] or "ru",
        internal_user_id=row["id"],
    )


def register_email_user(email: str, password: str, username: str = "", language: str = "ru") -> EmailIdentity:
    normalized_email = email.strip().lower()
    if "@" not in normalized_email:
        raise HTTPException(status_code=400, detail="Invalid email format")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    existing = db.get_user_by_provider(provider="email", provider_user_id=normalized_email)
    if existing and existing["password_hash"]:
        raise HTTPException(status_code=409, detail="Email is already registered")

    resolved_username = (username or normalized_email.split("@", 1)[0]).strip()
    user = db.get_or_create_user(
        provider="email",
        provider_user_id=normalized_email,
        username=resolved_username,
        language=language or "ru",
    )

    password_hash = _hash_password(password)
    with db.transaction() as conn:
        conn.execute("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", (password_hash, _now(), user["id"]))
    if db.count_admin_users() == 0:
        db.set_user_role(user["id"], "admin")

    return EmailIdentity(
        user_id=normalized_email,
        username=resolved_username,
        language=language or "ru",
        internal_user_id=user["id"],
    )


def login_email_user(email: str, password: str) -> EmailIdentity:
    normalized_email = email.strip().lower()
    user = db.get_user_by_provider(provider="email", provider_user_id=normalized_email)
    if not user or not user["password_hash"]:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not _verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return EmailIdentity(
        user_id=normalized_email,
        username=user["username"] or normalized_email,
        language=user["language"] or "ru",
        internal_user_id=user["id"],
    )


def issue_email_auth_token(identity: EmailIdentity) -> str:
    now = int(time.time())
    payload = {"sub": identity.user_id, "exp": now + settings.email_auth_ttl_seconds, "iat": now}
    return _encode_token(payload)


def _ensure_seed_email_user(email: str, password: str, username: str, role: str) -> None:
    normalized_email = email.strip().lower()
    if not normalized_email or not password or len(password) < 6:
        return
    existing = db.get_user_by_provider(provider="email", provider_user_id=normalized_email)
    if existing and existing["password_hash"]:
        if (existing["role"] or "user") != role:
            db.set_user_role(existing["id"], role)
        return

    user = db.get_or_create_user(
        provider="email",
        provider_user_id=normalized_email,
        username=username.strip() or normalized_email.split("@", 1)[0],
        language="ru",
    )
    if not existing or not existing["password_hash"]:
        password_hash = _hash_password(password)
        with db.transaction() as conn:
            conn.execute("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?", (password_hash, _now(), user["id"]))
    db.set_user_role(user["id"], role)


def ensure_seed_accounts() -> None:
    _ensure_seed_email_user(
        email=settings.seed_admin_email,
        password=settings.seed_admin_password,
        username="Admin",
        role="admin",
    )
    _ensure_seed_email_user(
        email=settings.seed_user_email,
        password=settings.seed_user_password,
        username=settings.seed_user_name,
        role="user",
    )


async def optional_email_auth(
    x_email_auth_token: str = Header(default="", alias="X-Email-Auth-Token"),
    email_auth_token: str = Cookie(default="", alias="email_auth_token"),
) -> EmailIdentity | None:
    token = x_email_auth_token or email_auth_token
    if not token:
        return None
    try:
        payload = _decode_token(token)
        email = str(payload.get("sub", "")).strip().lower()
        if not email:
            return None
        return _build_identity(email)
    except HTTPException:
        return None

