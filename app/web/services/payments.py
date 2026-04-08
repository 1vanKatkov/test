from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from yookassa import Configuration, Payment

from app.web.db import db
from config import settings


PACKAGE_CATALOG: dict[str, dict[str, Any]] = {
    "quick_10": {"sparks": 10, "amount": 10, "label": "10 искр - 10₽", "is_subscription": False},
    "topup_50": {"sparks": 50, "amount": 100, "label": "50 искр - 100₽", "is_subscription": False},
    "topup_100": {"sparks": 100, "amount": 200, "label": "100 искр - 200₽", "is_subscription": False},
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _configure_yookassa() -> None:
    if not settings.yookassa_shop_id or not settings.yookassa_secret_key:
        raise HTTPException(status_code=500, detail="YooKassa credentials are not configured")
    Configuration.configure(settings.yookassa_shop_id, settings.yookassa_secret_key)


def _extract_yookassa_error(exc: Exception) -> str:
    if exc.args and isinstance(exc.args[0], dict):
        payload = exc.args[0]
        description = payload.get("description") or "Unknown YooKassa error"
        parameter = payload.get("parameter")
        code = payload.get("code")
        suffix = ", ".join(filter(None, [f"code={code}" if code else "", f"parameter={parameter}" if parameter else ""]))
        return f"{description}{f' ({suffix})' if suffix else ''}"
    return str(exc)


def get_payment_packages() -> list[dict[str, Any]]:
    result = []
    for package_id, package in PACKAGE_CATALOG.items():
        result.append(
            {
                "id": package_id,
                "label": package["label"],
                "sparks": package["sparks"],
                "amount": package["amount"],
                "is_subscription": bool(package.get("is_subscription", False)),
                "subscription_days": package.get("subscription_days"),
            }
        )
    return result


def create_payment(user_id: int, package_id: str, receipt_email: str) -> dict[str, Any]:
    package = PACKAGE_CATALOG.get(package_id)
    if not package:
        raise HTTPException(status_code=404, detail="Payment package is not found")

    user = db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    _configure_yookassa()
    metadata = {
        "user_id": str(user_id),
        "provider": user["provider"],
        "provider_user_id": user["provider_user_id"],
        "package_id": package_id,
        "sparks": str(package["sparks"]),
        "is_subscription": "1" if package.get("is_subscription") else "0",
    }
    if package.get("subscription_days"):
        metadata["subscription_days"] = str(package["subscription_days"])

    payload = {
        "amount": {"value": f"{package['amount']:.2f}", "currency": "RUB"},
        "capture": True,
        "confirmation": {"type": "redirect", "return_url": settings.yookassa_return_url},
        "metadata": metadata,
        "description": f"Пополнение искр: {package['sparks']}",
    }
    email_for_receipt = (receipt_email or "").strip() or settings.yookassa_receipt_email.strip()
    if email_for_receipt:
        payload["receipt"] = {
            "customer": {"email": email_for_receipt},
            "items": [
                {
                    "description": f"Пополнение искр: {package['sparks']}",
                    "quantity": "1.00",
                    "amount": {"value": f"{package['amount']:.2f}", "currency": "RUB"},
                    "vat_code": settings.yookassa_vat_code,
                    "payment_mode": "full_payment",
                    "payment_subject": "service",
                }
            ],
        }

    try:
        payment = Payment.create(payload, uuid.uuid4().hex)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"YooKassa create payment error: {_extract_yookassa_error(exc)}") from exc

    with db.transaction() as conn:
        conn.execute(
            """
            INSERT INTO payments (
                payment_id, user_id, provider, provider_user_id, username, sparks, amount,
                status, credited, created_at, is_subscription, subscription_days
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payment.id,
                user_id,
                user["provider"],
                user["provider_user_id"],
                user["username"],
                package["sparks"],
                package["amount"],
                payment.status,
                0,
                _now(),
                1 if package.get("is_subscription") else 0,
                package.get("subscription_days"),
            ),
        )

    confirmation_url = ""
    if getattr(payment, "confirmation", None) and getattr(payment.confirmation, "confirmation_url", None):
        confirmation_url = payment.confirmation.confirmation_url
    return {"payment_id": payment.id, "status": payment.status, "confirmation_url": confirmation_url}


def _add_transaction(
    conn,
    user_id: int,
    amount: int,
    tx_type: str,
    reason: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO transactions (user_id, amount, type, reason, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (user_id, amount, tx_type, reason, json.dumps(metadata or {}, ensure_ascii=False), _now()),
    )


def _apply_payment_status(payment_id: str, requester_user_id: int, payment_status: str) -> dict[str, Any]:
    now = _now()

    with db.transaction() as conn:
        row = conn.execute(
            """
            SELECT p.*, u.credits
            FROM payments p
            JOIN users u ON u.id = p.user_id
            WHERE p.payment_id = ?
            """,
            (payment_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Payment is not found")
        if int(row["user_id"]) != requester_user_id:
            raise HTTPException(status_code=403, detail="Payment does not belong to current user")

        conn.execute("UPDATE payments SET status = ? WHERE payment_id = ?", (payment_status, payment_id))

        if payment_status == "succeeded" and int(row["credited"]) == 0:
            user_id = int(row["user_id"])
            is_subscription = int(row["is_subscription"]) == 1
            sparks = int(row["sparks"])
            metadata = {"payment_id": payment_id, "status": payment_status}

            if is_subscription:
                days = int(row["subscription_days"] or 0)
                if days <= 0:
                    raise HTTPException(status_code=500, detail="Subscription days are invalid")
                end_at = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
                conn.execute(
                    "UPDATE users SET credits = ?, subscription_end = ?, updated_at = ? WHERE id = ?",
                    (sparks, end_at, now, user_id),
                )
                _add_transaction(
                    conn,
                    user_id,
                    sparks,
                    "subscription_credit",
                    "yookassa_subscription",
                    {**metadata, "subscription_days": days, "subscription_end": end_at},
                )
            else:
                updated_balance = int(row["credits"]) + sparks
                conn.execute(
                    "UPDATE users SET credits = ?, updated_at = ? WHERE id = ?",
                    (updated_balance, now, user_id),
                )
                _add_transaction(conn, user_id, sparks, "payment_credit", "yookassa_topup", metadata)

            conn.execute("UPDATE payments SET credited = 1 WHERE payment_id = ?", (payment_id,))

        current_balance_row = conn.execute(
            "SELECT credits, subscription_end FROM users WHERE id = ?",
            (row["user_id"],),
        ).fetchone()
        payment_row = conn.execute(
            "SELECT credited FROM payments WHERE payment_id = ?",
            (payment_id,),
        ).fetchone()

    return {
        "payment_id": payment_id,
        "status": payment_status,
        "credited": int(payment_row["credited"]) == 1,
        "balance": int(current_balance_row["credits"]),
        "subscription_end": current_balance_row["subscription_end"],
    }


def check_payment(payment_id: str, requester_user_id: int) -> dict[str, Any]:
    _configure_yookassa()
    try:
        payment = Payment.find_one(payment_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"YooKassa check payment error: {_extract_yookassa_error(exc)}") from exc
    return _apply_payment_status(payment_id=payment_id, requester_user_id=requester_user_id, payment_status=payment.status)


def list_user_payments(user_id: int, limit: int = 30) -> list[dict[str, Any]]:
    _configure_yookassa()
    conn = db.connect()
    try:
        rows = conn.execute(
            """
            SELECT payment_id, sparks, amount, status, credited, created_at
            FROM payments
            WHERE user_id = ?
            ORDER BY datetime(created_at) DESC
            LIMIT ?
            """,
            (user_id, limit),
        ).fetchall()
    finally:
        conn.close()

    result: list[dict[str, Any]] = []
    terminal_statuses = {"succeeded", "canceled"}
    for row in rows:
        payment_id = row["payment_id"]
        status = row["status"]
        credited = int(row["credited"]) == 1
        if status not in terminal_statuses or (status == "succeeded" and not credited):
            try:
                sync = check_payment(payment_id=payment_id, requester_user_id=user_id)
                status = sync["status"]
                credited = bool(sync["credited"])
            except HTTPException:
                pass
        result.append(
            {
                "payment_id": payment_id,
                "sparks": int(row["sparks"]),
                "amount": int(row["amount"]),
                "status": status,
                "credited": credited,
                "created_at": row["created_at"],
                "can_cancel": status in {"pending", "waiting_for_capture"},
            }
        )
    return result


def cancel_payment(payment_id: str, requester_user_id: int) -> dict[str, Any]:
    _configure_yookassa()
    current = check_payment(payment_id=payment_id, requester_user_id=requester_user_id)
    if current["status"] in {"succeeded", "canceled"}:
        return current

    try:
        canceled = Payment.cancel(payment_id, uuid.uuid4().hex)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"YooKassa cancel payment error: {_extract_yookassa_error(exc)}") from exc

    return _apply_payment_status(
        payment_id=payment_id,
        requester_user_id=requester_user_id,
        payment_status=getattr(canceled, "status", "canceled"),
    )
