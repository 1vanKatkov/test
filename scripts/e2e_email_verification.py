#!/usr/bin/env python3
"""End-to-end check for classic email verification against a local SMTP sink."""

from __future__ import annotations

import importlib.util
import os
import sys
import threading
import time
import uuid
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ["EMAIL_SKIP_VERIFICATION"] = "false"
os.environ["EMAIL_AUTH_SECRET"] = os.environ.get(
    "EMAIL_AUTH_SECRET",
    "e2e-email-auth-secret-please-change-in-production-32b",
)
os.environ["SMTP_HOST"] = "127.0.0.1"
os.environ["SMTP_PORT"] = "1025"
os.environ["SMTP_USE_TLS"] = "false"
os.environ["SMTP_USE_SSL"] = "false"
os.environ["SMTP_USER"] = ""
os.environ["SMTP_PASSWORD"] = ""
os.environ["SMTP_FROM"] = "noreply@localhost.test"
os.environ["EMAIL_CODE_RESEND_COOLDOWN_SECONDS"] = "0"

sink_path = ROOT / "scripts" / "dev_smtp_sink.py"
spec = importlib.util.spec_from_file_location("dev_smtp_sink", sink_path)
assert spec and spec.loader
sink_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sink_mod)

import socketserver  # noqa: E402
from fastapi import HTTPException  # noqa: E402

from app.web.auth import email_auth  # noqa: E402
from app.web.db import db  # noqa: E402


def _start_sink() -> socketserver.ThreadingTCPServer:
    server = socketserver.ThreadingTCPServer(
        (sink_mod.HOST, sink_mod.PORT),
        sink_mod.SmtpSinkHandler,
    )
    server.allow_reuse_address = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    time.sleep(0.2)
    return server


def _read_code(timeout: float = 5.0) -> str:
    code_path = ROOT / "tmp" / "smtp-sink" / "last_code.txt"
    deadline = time.time() + timeout
    while time.time() < deadline:
        if code_path.exists():
            code = code_path.read_text(encoding="utf-8").strip()
            if code:
                return code
        time.sleep(0.05)
    raise TimeoutError("verification code was not captured by SMTP sink")


def main() -> None:
    db.init()
    sink = _start_sink()
    password = "TestPass123!"
    code_path = ROOT / "tmp" / "smtp-sink" / "last_code.txt"
    if code_path.exists():
        code_path.unlink()

    try:
        email = f"e2e-{uuid.uuid4().hex[:10]}@example.com"
        email_auth.start_email_registration(email, password, password, "ru")
        code = _read_code()
        print("captured code:", code)

        try:
            email_auth.verify_email_registration(email, "000000", "ru")
            raise AssertionError("invalid code should fail")
        except HTTPException as exc:
            assert exc.status_code == 400

        identity, is_new = email_auth.verify_email_registration(email, code, "ru")
        assert is_new is True
        assert identity.user_id == email
        login_identity = email_auth.login_email_user(email, password)
        assert login_identity.user_id == email

        email2 = f"e2e-{uuid.uuid4().hex[:10]}@example.com"
        if code_path.exists():
            code_path.unlink()
        email_auth.start_email_registration(email2, password, password, "ru")
        first = _read_code()
        if code_path.exists():
            code_path.unlink()
        email_auth.resend_registration_code(email2, "ru")
        second = _read_code()
        print("resend codes:", first, "->", second)

        try:
            email_auth.verify_email_registration(email2, first, "ru")
            raise AssertionError("old code after resend should fail")
        except HTTPException as exc:
            assert exc.status_code == 400

        identity2, is_new2 = email_auth.verify_email_registration(email2, second, "ru")
        assert is_new2 is True
        assert identity2.user_id == email2
        print("E2E email verification OK")
    finally:
        sink.shutdown()
        sink.server_close()


if __name__ == "__main__":
    main()
