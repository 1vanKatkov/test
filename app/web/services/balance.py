from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException

from app.web.db import db


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_balance(user_id: int) -> int:
    user = db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return int(user["credits"])


def _add_transaction(conn, user_id: int, amount: int, tx_type: str, reason: str, metadata: Optional[dict]) -> None:
    conn.execute(
        """
        INSERT INTO transactions (user_id, amount, type, reason, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (user_id, amount, tx_type, reason, json.dumps(metadata or {}, ensure_ascii=False), _now()),
    )


def record_transaction(user_id: int, amount: int, tx_type: str, reason: str, metadata: Optional[dict] = None) -> None:
    with db.transaction() as conn:
        row = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        _add_transaction(conn, user_id, amount, tx_type, reason, metadata)


def ensure_subscription_state(user_id: int) -> None:
    with db.transaction() as conn:
        row = conn.execute("SELECT credits, subscription_end FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        subscription_end = row["subscription_end"]
        if not subscription_end:
            return

        try:
            end_dt = datetime.fromisoformat(subscription_end)
        except ValueError:
            conn.execute(
                "UPDATE users SET subscription_end = NULL, updated_at = ? WHERE id = ?",
                (_now(), user_id),
            )
            return

        if datetime.now(timezone.utc) >= end_dt:
            conn.execute(
                "UPDATE users SET credits = 0, subscription_end = NULL, updated_at = ? WHERE id = ?",
                (_now(), user_id),
            )
            _add_transaction(
                conn,
                user_id,
                0,
                "subscription_expired",
                "subscription_expired",
                {"expired_at": subscription_end},
            )


def activate_subscription(user_id: int, sparks: int, days: int, reason: str, metadata: Optional[dict] = None) -> int:
    if days <= 0:
        raise HTTPException(status_code=400, detail="subscription_days must be > 0")
    with db.transaction() as conn:
        row = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")

        end_at = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
        conn.execute(
            "UPDATE users SET credits = ?, subscription_end = ?, updated_at = ? WHERE id = ?",
            (sparks, end_at, _now(), user_id),
        )
        _add_transaction(
            conn,
            user_id,
            sparks,
            "subscription_credit",
            reason,
            {**(metadata or {}), "subscription_days": days, "subscription_end": end_at},
        )
        return sparks


def credit(user_id: int, amount: int, reason: str, metadata: Optional[dict] = None, tx_type: str = "credit") -> int:
    with db.transaction() as conn:
        row = conn.execute("SELECT credits FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        updated = int(row["credits"]) + amount
        conn.execute("UPDATE users SET credits = ?, updated_at = ? WHERE id = ?", (updated, _now(), user_id))
        _add_transaction(conn, user_id, amount, tx_type, reason, metadata)
        return updated


def charge(user_id: int, amount: int, reason: str, metadata: Optional[dict] = None) -> int:
    ensure_subscription_state(user_id)
    with db.transaction() as conn:
        row = conn.execute("SELECT credits FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        current = int(row["credits"])
        if current < amount:
            raise HTTPException(status_code=400, detail="Insufficient credits")
        updated = current - amount
        conn.execute("UPDATE users SET credits = ?, updated_at = ? WHERE id = ?", (updated, _now(), user_id))
        _add_transaction(conn, user_id, -amount, "charge", reason, metadata)
        return updated


def refund(user_id: int, amount: int, reason: str, metadata: Optional[dict] = None) -> int:
    return credit(user_id, amount, reason, metadata, tx_type="refund")

