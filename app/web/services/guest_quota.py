from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass, field

from fastapi import HTTPException, Request, Response

from app.web.db import db
from app.web.services.balance import charge, get_balance, refund
from config import settings

GUEST_COOKIE_NAME = "astrolhub_guest_id"
GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
GUEST_QUOTA_EXCEEDED = "GUEST_QUOTA_EXCEEDED"


@dataclass
class ReadingSession:
    user_id: int
    provider: str
    is_guest_free: bool = False
    guest_id: str | None = None
    ip_hash: str | None = None
    cost_charged: int = 0
    module: str = ""
    _finalized: bool = field(default=False, repr=False)

    def charge(self, amount: int, reason: str, metadata: dict | None = None) -> None:
        if self.is_guest_free:
            self.cost_charged = 0
            return
        charge(self.user_id, amount, reason, metadata)
        self.cost_charged = int(amount)

    def refund(self, reason: str, metadata: dict | None = None) -> int:
        if self.is_guest_free or self.cost_charged <= 0:
            return self.balance()
        new_balance = refund(self.user_id, self.cost_charged, reason, metadata)
        self.cost_charged = 0
        return new_balance

    def balance(self) -> int:
        if self.is_guest_free:
            return 0
        return get_balance(self.user_id)

    def finalize_success(self, module: str = "") -> int:
        """Mark a successful free guest reading as consumed. Returns remaining free readings."""
        if self._finalized:
            return self.remaining()
        self._finalized = True
        used_module = module or self.module or "reading"
        if self.is_guest_free and self.guest_id:
            db.record_guest_free_reading(self.guest_id, self.ip_hash or "", used_module)
        return self.remaining()

    def remaining(self) -> int:
        if not self.is_guest_free:
            return 0
        limit = max(int(settings.guest_free_readings_limit), 0)
        used = db.count_guest_free_readings(self.guest_id or "", self.ip_hash or "")
        return max(0, limit - used)


def guest_ip_hash(request: Request) -> str:
    forwarded = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    ip = forwarded or (request.headers.get("x-real-ip") or "").strip()
    if not ip and request.client and request.client.host:
        ip = request.client.host
    ua = (request.headers.get("user-agent") or "")[:240]
    raw = f"{ip}|{ua}".encode("utf-8", errors="ignore")
    return hashlib.sha256(raw).hexdigest()[:32]


def ensure_guest_id(request: Request, response: Response) -> str:
    existing = (request.cookies.get(GUEST_COOKIE_NAME) or "").strip()
    if existing and 8 <= len(existing) <= 80:
        return existing
    guest_id = str(uuid.uuid4())
    response.set_cookie(
        key=GUEST_COOKIE_NAME,
        value=guest_id,
        max_age=GUEST_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return guest_id


def guest_quota_snapshot(request: Request, response: Response | None = None) -> dict[str, int]:
    limit = max(int(settings.guest_free_readings_limit), 0)
    guest_id = (request.cookies.get(GUEST_COOKIE_NAME) or "").strip()
    if response is not None and not guest_id:
        guest_id = ensure_guest_id(request, response)
    ip_hash = guest_ip_hash(request)
    used = db.count_guest_free_readings(guest_id, ip_hash) if (guest_id or ip_hash) else 0
    remaining = max(0, limit - used)
    return {"limit": limit, "used": used, "remaining": remaining}


def resolve_report_owner_user_id(
    request: Request,
    *,
    max_identity,
    telegram_identity,
    email_identity,
) -> int:
    """Resolve authenticated user or guest cookie account for reading saved reports."""
    if email_identity:
        return int(email_identity.internal_user_id)
    if max_identity:
        return int(max_identity.internal_user_id)
    if telegram_identity:
        return int(telegram_identity.internal_user_id)
    guest_id = (request.cookies.get(GUEST_COOKIE_NAME) or "").strip()
    if guest_id:
        row = db.get_user_by_provider("guest", guest_id)
        if row:
            return int(row["id"])
    raise HTTPException(status_code=401, detail="Authentication is required")


def begin_reading_session(
    request: Request,
    response: Response,
    *,
    max_identity,
    telegram_identity,
    email_identity,
    module: str,
) -> ReadingSession:
    if email_identity:
        return ReadingSession(
            user_id=int(email_identity.internal_user_id),
            provider="email",
            module=module,
        )
    if max_identity:
        return ReadingSession(
            user_id=int(max_identity.internal_user_id),
            provider="max",
            module=module,
        )
    if telegram_identity:
        return ReadingSession(
            user_id=int(telegram_identity.internal_user_id),
            provider="telegram",
            module=module,
        )

    limit = max(int(settings.guest_free_readings_limit), 0)
    guest_id = ensure_guest_id(request, response)
    ip_hash = guest_ip_hash(request)
    used = db.count_guest_free_readings(guest_id, ip_hash)
    if used >= limit:
        raise HTTPException(status_code=401, detail=GUEST_QUOTA_EXCEEDED)

    user = db.get_or_create_user(
        provider="guest",
        provider_user_id=guest_id,
        username=f"guest:{guest_id[:8]}",
        language=settings.app_default_lang,
        credits=0,
    )
    return ReadingSession(
        user_id=int(user["id"]),
        provider="guest",
        is_guest_free=True,
        guest_id=guest_id,
        ip_hash=ip_hash,
        module=module,
    )
