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
                    subscription_end TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(provider, provider_user_id)
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_user_id)")
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
            conn.execute("CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS payments (
                    payment_id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    provider TEXT NOT NULL,
                    provider_user_id TEXT NOT NULL,
                    username TEXT,
                    sparks INTEGER NOT NULL,
                    amount INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    credited INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL,
                    is_subscription INTEGER DEFAULT 0,
                    subscription_days INTEGER,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id)")
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
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS support_tickets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    subject TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'open',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS support_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ticket_id INTEGER NOT NULL,
                    author_user_id INTEGER NOT NULL,
                    message_text TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(ticket_id) REFERENCES support_tickets(id),
                    FOREIGN KEY(author_user_id) REFERENCES users(id)
                )
                """
            )
            self._ensure_column(conn, "users", "subscription_end", "TEXT")
            self._ensure_column(conn, "users", "password_hash", "TEXT")
            self._ensure_column(conn, "users", "role", "TEXT DEFAULT 'user'")
            self._ensure_column(conn, "payments", "provider", "TEXT DEFAULT 'telegram'")
            self._ensure_column(conn, "payments", "provider_user_id", "TEXT DEFAULT ''")
            self._ensure_column(conn, "payments", "username", "TEXT")
            self._ensure_column(conn, "payments", "credited", "INTEGER DEFAULT 0")
            self._ensure_column(conn, "payments", "is_subscription", "INTEGER DEFAULT 0")
            self._ensure_column(conn, "payments", "subscription_days", "INTEGER")
            self._ensure_column(conn, "generated_reports", "format", "TEXT DEFAULT 'pdf'")
            self._ensure_column(conn, "generated_reports", "content_json", "TEXT")
            self._ensure_column(conn, "generated_reports", "title", "TEXT")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_request_history_user_created ON request_history(user_id, created_at DESC)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id ON support_messages(ticket_id)")

    def _ensure_column(self, conn: sqlite3.Connection, table_name: str, column_name: str, column_def: str) -> None:
        columns = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        existing = {row["name"] for row in columns}
        if column_name not in existing:
            conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_def}")

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

    def get_user_by_provider(self, provider: str, provider_user_id: str) -> Optional[sqlite3.Row]:
        conn = self.connect()
        try:
            return conn.execute(
                "SELECT * FROM users WHERE provider = ? AND provider_user_id = ?",
                (provider, provider_user_id),
            ).fetchone()
        finally:
            conn.close()

    def is_user_admin(self, user_id: int) -> bool:
        row = self.get_user_by_id(user_id)
        return bool(row and (row["role"] or "user") == "admin")

    def set_user_role(self, user_id: int, role: str) -> None:
        with self.transaction() as conn:
            conn.execute("UPDATE users SET role = ?, updated_at = ? WHERE id = ?", (role, self._now(), user_id))

    def count_admin_users(self) -> int:
        conn = self.connect()
        try:
            return int(conn.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'").fetchone()[0])
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

    def list_request_history(
        self,
        user_id: int,
        limit: int = 50,
        offset: int = 0,
        module: Optional[str] = None,
    ) -> list[sqlite3.Row]:
        conn = self.connect()
        try:
            if module:
                rows = conn.execute(
                    """
                    SELECT id, user_id, module, input_text, output_text, created_at
                    FROM request_history
                    WHERE user_id = ? AND module = ?
                    ORDER BY id DESC
                    LIMIT ? OFFSET ?
                    """,
                    (user_id, module, limit, offset),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT id, user_id, module, input_text, output_text, created_at
                    FROM request_history
                    WHERE user_id = ?
                    ORDER BY id DESC
                    LIMIT ? OFFSET ?
                    """,
                    (user_id, limit, offset),
                ).fetchall()
            return rows
        finally:
            conn.close()

    def create_support_ticket(self, user_id: int, subject: str, message_text: str) -> int:
        now = self._now()
        with self.transaction() as conn:
            conn.execute(
                """
                INSERT INTO support_tickets (user_id, subject, status, created_at, updated_at)
                VALUES (?, ?, 'open', ?, ?)
                """,
                (user_id, subject, now, now),
            )
            ticket_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
            conn.execute(
                """
                INSERT INTO support_messages (ticket_id, author_user_id, message_text, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (ticket_id, user_id, message_text, now),
            )
            return ticket_id

    def add_support_message(self, ticket_id: int, author_user_id: int, message_text: str) -> None:
        now = self._now()
        with self.transaction() as conn:
            conn.execute(
                """
                INSERT INTO support_messages (ticket_id, author_user_id, message_text, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (ticket_id, author_user_id, message_text, now),
            )
            conn.execute("UPDATE support_tickets SET updated_at = ? WHERE id = ?", (now, ticket_id))

    def list_support_tickets_for_user(self, user_id: int, limit: int = 50, offset: int = 0) -> list[sqlite3.Row]:
        conn = self.connect()
        try:
            return conn.execute(
                """
                SELECT id, user_id, subject, status, created_at, updated_at
                FROM support_tickets
                WHERE user_id = ?
                ORDER BY updated_at DESC, id DESC
                LIMIT ? OFFSET ?
                """,
                (user_id, limit, offset),
            ).fetchall()
        finally:
            conn.close()

    def list_support_tickets_admin(
        self,
        limit: int = 100,
        offset: int = 0,
        status: Optional[str] = None,
    ) -> list[sqlite3.Row]:
        conn = self.connect()
        try:
            if status:
                return conn.execute(
                    """
                    SELECT st.id, st.user_id, st.subject, st.status, st.created_at, st.updated_at, u.username
                    FROM support_tickets st
                    JOIN users u ON u.id = st.user_id
                    WHERE st.status = ?
                    ORDER BY st.updated_at DESC, st.id DESC
                    LIMIT ? OFFSET ?
                    """,
                    (status, limit, offset),
                ).fetchall()
            return conn.execute(
                """
                SELECT st.id, st.user_id, st.subject, st.status, st.created_at, st.updated_at, u.username
                FROM support_tickets st
                JOIN users u ON u.id = st.user_id
                ORDER BY st.updated_at DESC, st.id DESC
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
            ).fetchall()
        finally:
            conn.close()

    def get_support_ticket(self, ticket_id: int) -> Optional[sqlite3.Row]:
        conn = self.connect()
        try:
            return conn.execute("SELECT * FROM support_tickets WHERE id = ?", (ticket_id,)).fetchone()
        finally:
            conn.close()

    def list_support_messages(self, ticket_id: int) -> list[sqlite3.Row]:
        conn = self.connect()
        try:
            return conn.execute(
                """
                SELECT sm.id, sm.ticket_id, sm.author_user_id, sm.message_text, sm.created_at, u.username
                FROM support_messages sm
                JOIN users u ON u.id = sm.author_user_id
                WHERE sm.ticket_id = ?
                ORDER BY sm.id ASC
                """,
                (ticket_id,),
            ).fetchall()
        finally:
            conn.close()

    def record_report(self, user_id: int, module: str, file_name: str, file_path: str) -> None:
        with self.transaction() as conn:
            conn.execute(
                """
                INSERT INTO generated_reports (user_id, module, file_name, file_path, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (user_id, module, file_name, file_path, self._now()),
            )

    def record_html_report(self, user_id: int, module: str, title: str, content_json: str) -> int:
        now = self._now()
        with self.transaction() as conn:
            conn.execute(
                """
                INSERT INTO generated_reports (user_id, module, file_name, file_path, created_at, format, content_json, title)
                VALUES (?, ?, ?, ?, ?, 'html', ?, ?)
                """,
                (user_id, module, "", "", now, content_json, title),
            )
            return int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])

    def get_html_report(self, report_id: int, user_id: int) -> Optional[sqlite3.Row]:
        conn = self.connect()
        try:
            return conn.execute(
                """
                SELECT *
                FROM generated_reports
                WHERE id = ? AND user_id = ? AND format = 'html'
                """,
                (report_id, user_id),
            ).fetchone()
        finally:
            conn.close()

    def get_admin_overview_stats(self) -> dict[str, int]:
        conn = self.connect()
        try:
            users_total = int(conn.execute("SELECT COUNT(*) FROM users").fetchone()[0])
            requests_total = int(conn.execute("SELECT COUNT(*) FROM request_history").fetchone()[0])
            payments_total = int(conn.execute("SELECT COUNT(*) FROM payments").fetchone()[0])
            succeeded_payments = int(conn.execute("SELECT COUNT(*) FROM payments WHERE status = 'succeeded'").fetchone()[0])
            revenue_total = int(
                conn.execute("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'succeeded'").fetchone()[0]
            )
            open_tickets = int(conn.execute("SELECT COUNT(*) FROM support_tickets WHERE status = 'open'").fetchone()[0])
            return {
                "users_total": users_total,
                "requests_total": requests_total,
                "payments_total": payments_total,
                "succeeded_payments": succeeded_payments,
                "revenue_total": revenue_total,
                "open_tickets": open_tickets,
            }
        finally:
            conn.close()

    def get_admin_module_stats(self) -> list[sqlite3.Row]:
        conn = self.connect()
        try:
            return conn.execute(
                """
                SELECT module, COUNT(*) AS total
                FROM request_history
                GROUP BY module
                ORDER BY total DESC
                """
            ).fetchall()
        finally:
            conn.close()


db = Database(settings.database_path)

