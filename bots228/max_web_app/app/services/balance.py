import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException

from app.db import db


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


def charge(user_id: int, amount: int, reason: str, metadata: Optional[dict] = None) -> int:
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
    with db.transaction() as conn:
        row = conn.execute("SELECT credits FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        updated = int(row["credits"]) + amount
        conn.execute("UPDATE users SET credits = ?, updated_at = ? WHERE id = ?", (updated, _now(), user_id))
        _add_transaction(conn, user_id, amount, "refund", reason, metadata)
        return updated
