from app.db import db
from app.services.balance import charge, get_balance, refund


def test_charge_and_refund_flow():
    user = db.get_or_create_user("max", "101", "tester", "ru")
    start = get_balance(user["id"])
    updated = charge(user["id"], 3, "test_charge")
    assert updated == start - 3
    restored = refund(user["id"], 3, "test_refund")
    assert restored == start
