#!/usr/bin/env python3
"""Minimal local SMTP sink for email verification e2e tests (stdlib only).

Usage:
  python scripts/dev_smtp_sink.py
"""

from __future__ import annotations

import re
import socketserver
from email.parser import BytesParser
from pathlib import Path


OUT_DIR = Path(__file__).resolve().parents[1] / "tmp" / "smtp-sink"
CODE_RE = re.compile(r"\b(\d{6})\b")
HOST = "127.0.0.1"
PORT = 1025


class SmtpSinkHandler(socketserver.StreamRequestHandler):
    def handle(self) -> None:
        self._send("220 localhost SMTP sink ready")
        mail_from = ""
        rcpt_tos: list[str] = []
        data_mode = False
        data_lines: list[bytes] = []

        while True:
            line = self.rfile.readline()
            if not line:
                break
            if data_mode:
                if line.rstrip(b"\r\n") == b".":
                    self._store_message(mail_from, rcpt_tos, b"".join(data_lines))
                    self._send("250 OK")
                    data_mode = False
                    data_lines = []
                else:
                    # Remove SMTP dot-stuffing.
                    if line.startswith(b".."):
                        line = line[1:]
                    data_lines.append(line)
                continue

            text = line.decode("utf-8", errors="replace").strip()
            upper = text.upper()
            if upper.startswith("HELO") or upper.startswith("EHLO"):
                self._send("250 localhost")
            elif upper.startswith("MAIL FROM:"):
                mail_from = text[10:].strip()
                self._send("250 OK")
            elif upper.startswith("RCPT TO:"):
                rcpt_tos.append(text[8:].strip())
                self._send("250 OK")
            elif upper == "DATA":
                data_mode = True
                self._send("354 End data with <CR><LF>.<CR><LF>")
            elif upper == "RSET":
                mail_from = ""
                rcpt_tos = []
                self._send("250 OK")
            elif upper == "NOOP":
                self._send("250 OK")
            elif upper == "QUIT":
                self._send("221 Bye")
                break
            else:
                self._send("502 Command not implemented")

    def _send(self, message: str) -> None:
        self.wfile.write(f"{message}\r\n".encode("ascii"))
        self.wfile.flush()

    def _store_message(self, mail_from: str, rcpt_tos: list[str], raw: bytes) -> None:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        parsed = BytesParser().parsebytes(raw)
        body = parsed.get_payload(decode=True)
        if isinstance(body, bytes):
            text = body.decode(parsed.get_content_charset() or "utf-8", errors="replace")
        else:
            text = str(parsed.get_payload() or "")
        stamp = int(__import__("time").time() * 1000)
        path = OUT_DIR / f"mail-{stamp}.eml"
        path.write_bytes(raw)
        match = CODE_RE.search(text) or CODE_RE.search(raw.decode("utf-8", errors="replace"))
        if match:
            (OUT_DIR / "last_code.txt").write_text(match.group(1), encoding="utf-8")
        (OUT_DIR / "last_to.txt").write_text(",".join(rcpt_tos) or mail_from, encoding="utf-8")
        print(f"captured mail -> {path}")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with socketserver.ThreadingTCPServer((HOST, PORT), SmtpSinkHandler) as server:
        server.allow_reuse_address = True
        print(f"SMTP sink listening on {HOST}:{PORT}")
        print(f"Messages saved under {OUT_DIR}")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("stopped")


if __name__ == "__main__":
    main()
