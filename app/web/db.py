from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Optional

from config import settings


class Database:
    def __init__(self, path: str) -> None:
        self.path = path

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    @contextmanager
    def transaction(self):
        conn = self.connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def init(self) -> None:
        with self.transaction() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    provider TEXT NOT NULL,
                    provider_user_id TEXT NOT NULL,
                    username TEXT,
                    language TEXT DEFAULT 'ru',
                    credits INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(provider, provider_user_id)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    amount INTEGER NOT NULL,
                    type TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    metadata TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS request_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    module TEXT NOT NULL,
                    input_text TEXT NOT NULL,
                    output_text TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS generated_reports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    module TEXT NOT NULL,
                    file_name TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                )
                """
            )

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    def get_or_create_user(
        self,
        provider: str,
        provider_user_id: str,
        username: Optional[str],
        language: str = "ru",
    ) -> sqlite3.Row:
        now = self._now()
        with self.transaction() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE provider = ? AND provider_user_id = ?",
                (provider, provider_user_id),
            ).fetchone()
            if row:
                conn.execute(
                    "UPDATE users SET username = ?, language = ?, updated_at = ? WHERE id = ?",
                    (username, language, now, row["id"]),
                )
                return conn.execute("SELECT * FROM users WHERE id = ?", (row["id"],)).fetchone()

            conn.execute(
                """
                INSERT INTO users (provider, provider_user_id, username, language, credits, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    provider,
                    provider_user_id,
                    username,
                    language,
                    settings.starting_credits,
                    now,
                    now,
                ),
            )
            user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    def get_user_by_id(self, user_id: int) -> Optional[sqlite3.Row]:
        conn = self.connect()
        try:
            return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        finally:
            conn.close()

    def record_history(self, user_id: int, module: str, input_text: str, output_text: str) -> None:
        with self.transaction() as conn:
            conn.execute(
                """
                INSERT INTO request_history (user_id, module, input_text, output_text, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (user_id, module, input_text, output_text, self._now()),
            )

    def record_report(self, user_id: int, module: str, file_name: str, file_path: str) -> None:
        with self.transaction() as conn:
            conn.execute(
                """
                INSERT INTO generated_reports (user_id, module, file_name, file_path, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (user_id, module, file_name, file_path, self._now()),
            )


db = Database(settings.database_path)

