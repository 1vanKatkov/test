from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import Cookie, Header, HTTPException

from app.web.db import db
from app.web.services.mailer import send_verification_email
from config import settings


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@dataclass
class EmailIdentity:
    user_id: str
    username: str
    language: str
    internal_user_id: int


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _secret() -> str:
    if settings.email_auth_secret:
        return settings.email_auth_secret
    if settings.max_auth_secret:
        return settings.max_auth_secret
    for token in (settings.telegram_bot_token, settings.telegram_bot_token_en):
        if token:
            return hashlib.sha256((token + "\nastrolhub_email_session_v1").encode("utf-8")).hexdigest()
    return "change-me-email-auth-secret"


def _code_pepper() -> str:
    if settings.email_code_pepper:
        return settings.email_code_pepper
    return _secret()


def normalize_email(email: str) -> str:
    normalized = (email or "").strip().lower()
    if not normalized or not _EMAIL_RE.match(normalized):
        raise HTTPException(status_code=400, detail="Invalid email format")
    return normalized


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


def _hash_code(code: str) -> str:
    return hashlib.sha256(f"{code}:{_code_pepper()}".encode("utf-8")).hexdigest()


def _generate_code() -> str:
    return f"{secrets.randbelow(900_000) + 100_000:06d}"


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


def _validate_password_pair(password: str, password_confirm: str) -> None:
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if password != password_confirm:
        raise HTTPException(status_code=400, detail="Passwords do not match")


def _check_resend_cooldown(row) -> None:
    if not row:
        return
    created = datetime.fromisoformat(row["created_at"])
    elapsed = (datetime.now(timezone.utc) - created).total_seconds()
    if elapsed < settings.email_code_resend_cooldown_seconds:
        raise HTTPException(status_code=429, detail="Please wait before requesting a new code")


def _issue_and_store_code(email: str, purpose: str, payload: dict, lang: str) -> None:
    existing = db.get_email_verification(email, purpose)
    _check_resend_cooldown(existing)

    code = _generate_code()
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=settings.email_code_ttl_seconds)).isoformat()
    db.upsert_email_verification(
        email=email,
        purpose=purpose,
        code_hash=_hash_code(code),
        payload=payload,
        expires_at=expires_at,
    )
    send_verification_email(email, code, purpose, lang)


def _verify_stored_code(email: str, purpose: str, code: str) -> dict:
    row = db.get_email_verification(email, purpose)
    if not row:
        raise HTTPException(status_code=400, detail="Verification code expired or not found")

    if int(row["attempts"]) >= settings.email_code_max_attempts:
        db.delete_email_verification(email, purpose)
        raise HTTPException(status_code=400, detail="Too many invalid attempts. Request a new code.")

    expires_at = datetime.fromisoformat(row["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        db.delete_email_verification(email, purpose)
        raise HTTPException(status_code=400, detail="Verification code expired")

    normalized_code = (code or "").strip()
    if not hmac.compare_digest(_hash_code(normalized_code), row["code_hash"]):
        db.increment_email_verification_attempts(int(row["id"]))
        raise HTTPException(status_code=400, detail="Invalid verification code")

    try:
        payload = json.loads(row["payload_json"] or "{}")
    except json.JSONDecodeError:
        payload = {}
    db.delete_email_verification(email, purpose)
    return payload


def _build_identity(email: str) -> EmailIdentity:
    row = db.get_user_by_provider(provider="email", provider_user_id=email)
    if not row or not row["password_hash"]:
        raise HTTPException(status_code=401, detail="Email user not found")
    return EmailIdentity(
        user_id=email,
        username=row["username"] or email.split("@", 1)[0],
        language=row["language"] or "ru",
        internal_user_id=int(row["id"]),
    )


def issue_email_auth_token(identity: EmailIdentity) -> str:
    now = int(time.time())
    return _encode_token({"sub": identity.user_id, "exp": now + settings.email_auth_ttl_seconds, "iat": now})


def has_pending_registration(email: str) -> bool:
    normalized_email = normalize_email(email)
    row = db.get_email_verification(normalized_email, "register")
    if not row:
        return False
    try:
        expires_at = datetime.fromisoformat(row["expires_at"])
    except ValueError:
        return False
    return datetime.now(timezone.utc) <= expires_at


def start_email_registration(email: str, password: str, password_confirm: str, lang: str = "ru") -> dict:
    normalized_email = normalize_email(email)
    _validate_password_pair(password, password_confirm)

    existing = db.get_user_by_provider(provider="email", provider_user_id=normalized_email)
    if existing and existing["password_hash"]:
        raise HTTPException(status_code=409, detail="Email is already registered")

    _issue_and_store_code(
        normalized_email,
        "register",
        {"password_hash": _hash_password(password)},
        lang,
    )
    return {
        "success": True,
        "message": "Verification code sent",
        "email": normalized_email,
    }


def _finalize_email_registration(
    normalized_email: str,
    password_hash: str,
    lang: str = "ru",
) -> tuple[EmailIdentity, bool]:
    existing = db.get_user_by_provider(provider="email", provider_user_id=normalized_email)
    is_new = not existing or not existing["password_hash"]
    username = normalized_email.split("@", 1)[0]
    user = db.get_or_create_user(
        provider="email",
        provider_user_id=normalized_email,
        username=username,
        language=lang or "ru",
    )
    db.update_user_password_hash(int(user["id"]), password_hash)
    if is_new and db.count_admin_users() == 0:
        db.set_user_role(int(user["id"]), "admin")

    return (
        EmailIdentity(
            user_id=normalized_email,
            username=user["username"] or username,
            language=user["language"] or lang or "ru",
            internal_user_id=int(user["id"]),
        ),
        is_new,
    )


def complete_email_registration(
    email: str,
    password: str,
    password_confirm: str,
    lang: str = "ru",
) -> tuple[EmailIdentity, bool]:
    normalized_email = normalize_email(email)
    _validate_password_pair(password, password_confirm)
    db.delete_email_verification(normalized_email, "register")

    existing = db.get_user_by_provider(provider="email", provider_user_id=normalized_email)
    if existing and existing["password_hash"]:
        raise HTTPException(status_code=409, detail="Email is already registered")

    return _finalize_email_registration(normalized_email, _hash_password(password), lang)


def verify_email_registration(email: str, code: str, lang: str = "ru") -> tuple[EmailIdentity, bool]:
    normalized_email = normalize_email(email)
    payload = _verify_stored_code(normalized_email, "register", code)
    password_hash = payload.get("password_hash")
    if not password_hash:
        raise HTTPException(status_code=400, detail="Registration data is invalid")
    return _finalize_email_registration(normalized_email, password_hash, lang)


def login_email_user(email: str, password: str) -> EmailIdentity:
    normalized_email = normalize_email(email)
    user = db.get_user_by_provider(provider="email", provider_user_id=normalized_email)
    if not user or not user["password_hash"]:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not _verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return EmailIdentity(
        user_id=normalized_email,
        username=user["username"] or normalized_email.split("@", 1)[0],
        language=user["language"] or "ru",
        internal_user_id=int(user["id"]),
    )


def resend_registration_code(email: str, lang: str = "ru") -> dict:
    normalized_email = normalize_email(email)
    row = db.get_email_verification(normalized_email, "register")
    if not row:
        raise HTTPException(status_code=400, detail="No pending registration. Start registration again.")
    try:
        payload = json.loads(row["payload_json"] or "{}")
    except json.JSONDecodeError:
        payload = {}
    if not payload.get("password_hash"):
        raise HTTPException(status_code=400, detail="No pending registration. Start registration again.")
    _issue_and_store_code(normalized_email, "register", payload, lang)
    return {"success": True, "message": "Verification code sent", "email": normalized_email}


def request_password_reset(identity: EmailIdentity, lang: str = "ru") -> dict:
    _issue_and_store_code(identity.user_id, "password_reset", {}, lang)
    return {"success": True, "message": "Verification code sent"}


def confirm_password_reset(
    identity: EmailIdentity,
    code: str,
    new_password: str,
    password_confirm: str,
) -> EmailIdentity:
    _validate_password_pair(new_password, password_confirm)
    _verify_stored_code(identity.user_id, "password_reset", code)
    db.update_user_password_hash(identity.internal_user_id, _hash_password(new_password))
    return _build_identity(identity.user_id)


def _ensure_seed_email_user(email: str, password: str, username: str, role: str) -> None:
    normalized_email = normalize_email(email)
    if len(password) < 8:
        return
    existing = db.get_user_by_provider(provider="email", provider_user_id=normalized_email)
    if existing and existing["password_hash"]:
        if (existing["role"] or "user") != role:
            db.set_user_role(int(existing["id"]), role)
        return

    user = db.get_or_create_user(
        provider="email",
        provider_user_id=normalized_email,
        username=username.strip() or normalized_email.split("@", 1)[0],
        language="ru",
    )
    if not existing or not existing["password_hash"]:
        db.update_user_password_hash(int(user["id"]), _hash_password(password))
    db.set_user_role(int(user["id"]), role)


def ensure_seed_accounts() -> None:
    for email, password, username, role in (
        (settings.seed_admin_email, settings.seed_admin_password, "Admin", "admin"),
        (settings.seed_user_email, settings.seed_user_password, settings.seed_user_name, "user"),
    ):
        if not email or not password:
            continue
        try:
            _ensure_seed_email_user(email=email, password=password, username=username, role=role)
        except HTTPException:
            continue


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
