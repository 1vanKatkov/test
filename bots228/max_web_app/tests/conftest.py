import hashlib
import hmac
import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import auth
from app.db import db
from main import app


@pytest.fixture(autouse=True)
def isolated_db(tmp_path: Path, monkeypatch):
    db.path = str(tmp_path / "test.db")
    db.init()
    monkeypatch.setattr(auth.max_auth, "MAX_AUTH_SECRET", "test-secret")
    yield


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_headers_builder():
    def _build(body: dict, user_id: str = "42"):
        payload = json.dumps(body, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        digest = hashlib.sha256(payload).hexdigest()
        timestamp = str(int(time.time()))
        nonce = "pytest"
        signature = hmac.new(
            b"test-secret",
            f"{user_id}:{timestamp}:{nonce}:{digest}".encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        return {
            "X-Max-User-Id": user_id,
            "X-Max-Timestamp": timestamp,
            "X-Max-Nonce": nonce,
            "X-Max-Signature": signature,
            "X-Max-Username": "tester",
            "X-Max-Language": "ru",
            "Content-Type": "application/json",
        }

    return _build
