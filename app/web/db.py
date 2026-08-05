from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Optional

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
                CREATE TABLE IF NOT EXISTS user_personas (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    birth_date TEXT NOT NULL,
                    birth_time TEXT,
                    birth_place TEXT,
                    note TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
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
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS admin_audit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    admin_user_id INTEGER NOT NULL,
                    action TEXT NOT NULL,
                    target_user_id INTEGER,
                    metadata TEXT,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(admin_user_id) REFERENCES users(id)
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
            conn.execute("CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_request_history_created_at ON request_history(created_at)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_payments_created_status ON payments(created_at, status)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_transactions_created_type ON transactions(created_at, type)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_user_personas_user_updated ON user_personas(user_id, updated_at DESC)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_support_tickets_created_status ON support_tickets(created_at, status)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id ON support_messages(ticket_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC)")
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS email_verification_codes (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT NOT NULL,
                    purpose TEXT NOT NULL,
                    code_hash TEXT NOT NULL,
                    payload_json TEXT NOT NULL DEFAULT '{}',
                    expires_at TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    UNIQUE(email, purpose)
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_email_verification_email_purpose ON email_verification_codes(email, purpose)"
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS app_meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS tarot_cards (
                    id TEXT PRIMARY KEY,
                    number INTEGER,
                    arcana TEXT NOT NULL,
                    suit TEXT NOT NULL DEFAULT '',
                    rank TEXT NOT NULL DEFAULT '',
                    symbol TEXT NOT NULL DEFAULT '',
                    name_ru TEXT NOT NULL,
                    name_en TEXT NOT NULL,
                    keywords_ru TEXT NOT NULL,
                    keywords_en TEXT NOT NULL,
                    light_ru TEXT NOT NULL,
                    light_en TEXT NOT NULL,
                    shadow_ru TEXT NOT NULL,
                    shadow_en TEXT NOT NULL,
                    love_ru TEXT NOT NULL,
                    love_en TEXT NOT NULL,
                    finances_ru TEXT NOT NULL,
                    finances_en TEXT NOT NULL,
                    career_ru TEXT NOT NULL,
                    career_en TEXT NOT NULL,
                    growth_ru TEXT NOT NULL,
                    growth_en TEXT NOT NULL,
                    symbolism_ru TEXT NOT NULL,
                    symbolism_en TEXT NOT NULL,
                    advice_ru TEXT NOT NULL,
                    advice_en TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_tarot_cards_arcana ON tarot_cards(arcana, number)")
            self._seed_tarot_cards(conn)

    def _seed_tarot_cards(self, conn: sqlite3.Connection) -> None:
        from app.web.data.rider_waite_deck import RIDER_WAITE_CARDS

        now = self._now()
        for card in RIDER_WAITE_CARDS:
            conn.execute(
                """
                INSERT INTO tarot_cards (
                    id, number, arcana, suit, rank, symbol,
                    name_ru, name_en, keywords_ru, keywords_en,
                    light_ru, light_en, shadow_ru, shadow_en,
                    love_ru, love_en, finances_ru, finances_en,
                    career_ru, career_en, growth_ru, growth_en,
                    symbolism_ru, symbolism_en, advice_ru, advice_en,
                    updated_at
                ) VALUES (
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?
                )
                ON CONFLICT(id) DO UPDATE SET
                    number=excluded.number,
                    arcana=excluded.arcana,
                    suit=excluded.suit,
                    rank=excluded.rank,
                    symbol=excluded.symbol,
                    name_ru=excluded.name_ru,
                    name_en=excluded.name_en,
                    keywords_ru=excluded.keywords_ru,
                    keywords_en=excluded.keywords_en,
                    light_ru=excluded.light_ru,
                    light_en=excluded.light_en,
                    shadow_ru=excluded.shadow_ru,
                    shadow_en=excluded.shadow_en,
                    love_ru=excluded.love_ru,
                    love_en=excluded.love_en,
                    finances_ru=excluded.finances_ru,
                    finances_en=excluded.finances_en,
                    career_ru=excluded.career_ru,
                    career_en=excluded.career_en,
                    growth_ru=excluded.growth_ru,
                    growth_en=excluded.growth_en,
                    symbolism_ru=excluded.symbolism_ru,
                    symbolism_en=excluded.symbolism_en,
                    advice_ru=excluded.advice_ru,
                    advice_en=excluded.advice_en,
                    updated_at=excluded.updated_at
                """,
                (
                    card["id"],
                    card.get("number"),
                    card["arcana"],
                    card.get("suit") or "",
                    card.get("rank") or "",
                    card.get("symbol") or "",
                    card["name_ru"],
                    card["name_en"],
                    card["keywords_ru"],
                    card["keywords_en"],
                    card["light_ru"],
                    card["light_en"],
                    card["shadow_ru"],
                    card["shadow_en"],
                    card["love_ru"],
                    card["love_en"],
                    card["finances_ru"],
                    card["finances_en"],
                    card["career_ru"],
                    card["career_en"],
                    card["growth_ru"],
                    card["growth_en"],
                    card["symbolism_ru"],
                    card["symbolism_en"],
                    card["advice_ru"],
                    card["advice_en"],
                    now,
                ),
            )

    def list_tarot_cards(self) -> list[sqlite3.Row]:
        conn = self.connect()
        try:
            return conn.execute(
                """
                SELECT *
                FROM tarot_cards
                ORDER BY
                    CASE WHEN arcana = 'major' THEN 0 ELSE 1 END,
                    number ASC,
                    id ASC
                """
            ).fetchall()
        finally:
            conn.close()

    def get_tarot_cards_by_ids(self, card_ids: list[str]) -> list[sqlite3.Row]:
        ids = [str(card_id).strip() for card_id in card_ids if str(card_id).strip()]
        if not ids:
            return []
        placeholders = ", ".join("?" for _ in ids)
        conn = self.connect()
        try:
            rows = conn.execute(
                f"SELECT * FROM tarot_cards WHERE id IN ({placeholders})",
                ids,
            ).fetchall()
        finally:
            conn.close()
        by_id = {row["id"]: row for row in rows}
        return [by_id[card_id] for card_id in ids if card_id in by_id]

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
                    "UPDATE users SET username = ?, updated_at = ? WHERE id = ?",
                    (username, now, row["id"]),
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

    def update_user_language(self, user_id: int, language: str) -> None:
        now = self._now()
        with self.transaction() as conn:
            conn.execute(
                "UPDATE users SET language = ?, updated_at = ? WHERE id = ?",
                (language, now, user_id),
            )

    def upsert_email_verification(
        self,
        email: str,
        purpose: str,
        code_hash: str,
        payload: dict[str, Any],
        expires_at: str,
    ) -> None:
        now = self._now()
        payload_json = json.dumps(payload, ensure_ascii=False)
        with self.transaction() as conn:
            conn.execute(
                """
                INSERT INTO email_verification_codes
                    (email, purpose, code_hash, payload_json, expires_at, attempts, created_at)
                VALUES (?, ?, ?, ?, ?, 0, ?)
                ON CONFLICT(email, purpose) DO UPDATE SET
                    code_hash = excluded.code_hash,
                    payload_json = excluded.payload_json,
                    expires_at = excluded.expires_at,
                    attempts = 0,
                    created_at = excluded.created_at
                """,
                (email, purpose, code_hash, payload_json, expires_at, now),
            )

    def get_email_verification(self, email: str, purpose: str) -> Optional[sqlite3.Row]:
        conn = self.connect()
        try:
            return conn.execute(
                "SELECT * FROM email_verification_codes WHERE email = ? AND purpose = ?",
                (email, purpose),
            ).fetchone()
        finally:
            conn.close()

    def increment_email_verification_attempts(self, verification_id: int) -> None:
        with self.transaction() as conn:
            conn.execute(
                "UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id = ?",
                (verification_id,),
            )

    def delete_email_verification(self, email: str, purpose: str) -> None:
        with self.transaction() as conn:
            conn.execute(
                "DELETE FROM email_verification_codes WHERE email = ? AND purpose = ?",
                (email, purpose),
            )

    def update_user_password_hash(self, user_id: int, password_hash: str) -> None:
        now = self._now()
        with self.transaction() as conn:
            conn.execute(
                "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
                (password_hash, now, user_id),
            )

    def get_user_by_provider(self, provider: str, provider_user_id: str) -> Optional[sqlite3.Row]:
        conn = self.connect()
        try:
            return conn.execute(
                "SELECT * FROM users WHERE provider = ? AND provider_user_id = ?",
                (provider, provider_user_id),
            ).fetchone()
        finally:
            conn.close()

    def get_telegram_user_by_username_ci(self, username: str) -> Optional[sqlite3.Row]:
        """Lookup Telegram account by @username (case-insensitive, without leading @)."""
        raw = (username or "").strip().lstrip("@").lower()
        if not raw:
            return None
        conn = self.connect()
        try:
            return conn.execute(
                "SELECT * FROM users WHERE provider = 'telegram' AND lower(username) = ?",
                (raw,),
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

    def get_request_history_item(self, user_id: int, request_id: int) -> Optional[sqlite3.Row]:
        conn = self.connect()
        try:
            return conn.execute(
                """
                SELECT id, user_id, module, input_text, output_text, created_at
                FROM request_history
                WHERE user_id = ? AND id = ?
                LIMIT 1
                """,
                (user_id, request_id),
            ).fetchone()
        finally:
            conn.close()

    def create_persona(
        self,
        user_id: int,
        name: str,
        birth_date: str,
        birth_time: str = "",
        birth_place: str = "",
        note: str = "",
    ) -> sqlite3.Row:
        now = self._now()
        with self.transaction() as conn:
            conn.execute(
                """
                INSERT INTO user_personas
                    (user_id, name, birth_date, birth_time, birth_place, note, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (user_id, name, birth_date, birth_time, birth_place, note, now, now),
            )
            persona_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
            return conn.execute(
                "SELECT * FROM user_personas WHERE id = ? AND user_id = ?",
                (persona_id, user_id),
            ).fetchone()

    def list_personas(self, user_id: int) -> list[sqlite3.Row]:
        conn = self.connect()
        try:
            return conn.execute(
                """
                SELECT *
                FROM user_personas
                WHERE user_id = ?
                ORDER BY updated_at DESC, id DESC
                """,
                (user_id,),
            ).fetchall()
        finally:
            conn.close()

    def get_persona(self, user_id: int, persona_id: int) -> Optional[sqlite3.Row]:
        conn = self.connect()
        try:
            return conn.execute(
                "SELECT * FROM user_personas WHERE id = ? AND user_id = ?",
                (persona_id, user_id),
            ).fetchone()
        finally:
            conn.close()

    def update_persona(
        self,
        user_id: int,
        persona_id: int,
        name: str,
        birth_date: str,
        birth_time: str = "",
        birth_place: str = "",
        note: str = "",
    ) -> Optional[sqlite3.Row]:
        now = self._now()
        with self.transaction() as conn:
            conn.execute(
                """
                UPDATE user_personas
                SET name = ?, birth_date = ?, birth_time = ?, birth_place = ?, note = ?, updated_at = ?
                WHERE id = ? AND user_id = ?
                """,
                (name, birth_date, birth_time, birth_place, note, now, persona_id, user_id),
            )
            return conn.execute(
                "SELECT * FROM user_personas WHERE id = ? AND user_id = ?",
                (persona_id, user_id),
            ).fetchone()

    def delete_persona(self, user_id: int, persona_id: int) -> bool:
        with self.transaction() as conn:
            cursor = conn.execute(
                "DELETE FROM user_personas WHERE id = ? AND user_id = ?",
                (persona_id, user_id),
            )
            return cursor.rowcount > 0

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

    def record_admin_audit(
        self,
        admin_user_id: int,
        action: str,
        target_user_id: Optional[int] = None,
        metadata: Optional[dict] = None,
    ) -> None:
        with self.transaction() as conn:
            conn.execute(
                """
                INSERT INTO admin_audit_log (admin_user_id, action, target_user_id, metadata, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (admin_user_id, action, target_user_id, json.dumps(metadata or {}, ensure_ascii=False), self._now()),
            )

    def list_admin_audit_log(self, limit: int = 100, offset: int = 0) -> list[sqlite3.Row]:
        conn = self.connect()
        try:
            return conn.execute(
                """
                SELECT aal.id, aal.admin_user_id, aal.action, aal.target_user_id, aal.metadata, aal.created_at,
                       admin.username AS admin_username, target.username AS target_username
                FROM admin_audit_log aal
                LEFT JOIN users admin ON admin.id = aal.admin_user_id
                LEFT JOIN users target ON target.id = aal.target_user_id
                ORDER BY aal.id DESC
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
            ).fetchall()
        finally:
            conn.close()

    def get_admin_overview_stats(self, date_from: str = "", date_to: str = "") -> dict[str, int]:
        conn = self.connect()
        try:
            period_clause = "substr(created_at, 1, 10) BETWEEN ? AND ?" if date_from and date_to else "1=1"
            period_params = (date_from, date_to) if date_from and date_to else ()
            users_total = int(conn.execute("SELECT COUNT(*) FROM users").fetchone()[0])
            requests_total = int(conn.execute("SELECT COUNT(*) FROM request_history").fetchone()[0])
            payments_total = int(conn.execute("SELECT COUNT(*) FROM payments").fetchone()[0])
            succeeded_payments = int(conn.execute("SELECT COUNT(*) FROM payments WHERE status = 'succeeded'").fetchone()[0])
            revenue_total = int(
                conn.execute("SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'succeeded'").fetchone()[0]
            )
            open_tickets = int(conn.execute("SELECT COUNT(*) FROM support_tickets WHERE status = 'open'").fetchone()[0])
            new_users = int(conn.execute(f"SELECT COUNT(*) FROM users WHERE {period_clause}", period_params).fetchone()[0])
            period_requests = int(
                conn.execute(f"SELECT COUNT(*) FROM request_history WHERE {period_clause}", period_params).fetchone()[0]
            )
            active_users = int(
                conn.execute(
                    f"SELECT COUNT(DISTINCT user_id) FROM request_history WHERE {period_clause}",
                    period_params,
                ).fetchone()[0]
            )
            period_succeeded_payments = int(
                conn.execute(
                    f"SELECT COUNT(*) FROM payments WHERE status = 'succeeded' AND {period_clause}",
                    period_params,
                ).fetchone()[0]
            )
            period_revenue = int(
                conn.execute(
                    f"SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'succeeded' AND {period_clause}",
                    period_params,
                ).fetchone()[0]
            )
            sparks_charged = int(
                conn.execute(
                    f"SELECT COALESCE(SUM(ABS(amount)), 0) FROM transactions WHERE amount < 0 AND {period_clause}",
                    period_params,
                ).fetchone()[0]
            )
            sparks_added = int(
                conn.execute(
                    f"SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE amount > 0 AND {period_clause}",
                    period_params,
                ).fetchone()[0]
            )
            return {
                "users_total": users_total,
                "requests_total": requests_total,
                "payments_total": payments_total,
                "succeeded_payments": succeeded_payments,
                "revenue_total": revenue_total,
                "open_tickets": open_tickets,
                "new_users": new_users,
                "period_requests": period_requests,
                "active_users": active_users,
                "period_succeeded_payments": period_succeeded_payments,
                "period_revenue": period_revenue,
                "sparks_charged": sparks_charged,
                "sparks_added": sparks_added,
            }
        finally:
            conn.close()

    def search_users(
        self,
        query: str,
        limit: int = 50,
        offset: int = 0,
        provider: str = "",
        role: str = "",
    ) -> list[sqlite3.Row]:
        raw = (query or "").strip()
        clauses = []
        params: list[Any] = []
        if provider:
            clauses.append("provider = ?")
            params.append(provider)
        if role:
            clauses.append("COALESCE(role, 'user') = ?")
            params.append(role)
        conn = self.connect()
        try:
            if not raw:
                where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
                return conn.execute(
                    f"""
                    SELECT id, provider, provider_user_id, username, credits, role, created_at, updated_at
                    FROM users
                    {where_sql}
                    ORDER BY id DESC
                    LIMIT ? OFFSET ?
                    """,
                    (*params, limit, offset),
                ).fetchall()
            if raw.isdigit():
                id_clauses = ["id = ?", *clauses]
                return conn.execute(
                    f"""
                    SELECT id, provider, provider_user_id, username, credits, role, created_at, updated_at
                    FROM users
                    WHERE {' AND '.join(id_clauses)}
                    LIMIT ? OFFSET ?
                    """,
                    (int(raw), *params, limit, offset),
                ).fetchall()
            pattern = f"%{raw}%"
            search_clauses = ["(provider_user_id LIKE ? OR lower(COALESCE(username, '')) LIKE lower(?))", *clauses]
            return conn.execute(
                f"""
                SELECT id, provider, provider_user_id, username, credits, role, created_at, updated_at
                FROM users
                WHERE {' AND '.join(search_clauses)}
                ORDER BY id DESC
                LIMIT ? OFFSET ?
                """,
                (pattern, pattern, *params, limit, offset),
            ).fetchall()
        finally:
            conn.close()

    def get_admin_user_detail(self, user_id: int) -> Optional[sqlite3.Row]:
        conn = self.connect()
        try:
            return conn.execute(
                """
                SELECT u.*,
                       (SELECT MAX(created_at) FROM request_history WHERE user_id = u.id) AS last_request_at,
                       (SELECT COUNT(*) FROM request_history WHERE user_id = u.id) AS requests_total,
                       (SELECT COUNT(*) FROM payments WHERE user_id = u.id AND status = 'succeeded') AS succeeded_payments,
                       (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE user_id = u.id AND status = 'succeeded') AS revenue_total
                FROM users u
                WHERE u.id = ?
                """,
                (user_id,),
            ).fetchone()
        finally:
            conn.close()

    def list_transactions_for_user(self, user_id: int, limit: int = 50) -> list[sqlite3.Row]:
        conn = self.connect()
        try:
            return conn.execute(
                """
                SELECT *
                FROM transactions
                WHERE user_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()
        finally:
            conn.close()

    def list_payments_for_user_admin(self, user_id: int, limit: int = 50) -> list[sqlite3.Row]:
        conn = self.connect()
        try:
            return conn.execute(
                """
                SELECT *
                FROM payments
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (user_id, limit),
            ).fetchall()
        finally:
            conn.close()

    def update_user_role(self, user_id: int, role: str) -> None:
        with self.transaction() as conn:
            conn.execute("UPDATE users SET role = ?, updated_at = ? WHERE id = ?", (role, self._now(), user_id))

    def update_user_role_safely(self, user_id: int, role: str) -> sqlite3.Row:
        with self.transaction() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            if not row:
                raise ValueError("User not found")
            current_role = row["role"] or "user"
            if current_role == "admin" and role != "admin":
                admin_count = int(conn.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'").fetchone()[0])
                if admin_count <= 1:
                    raise RuntimeError("Cannot remove the last admin")
            conn.execute("UPDATE users SET role = ?, updated_at = ? WHERE id = ?", (role, self._now(), user_id))
            return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    def update_support_ticket_status(self, ticket_id: int, status: str) -> bool:
        with self.transaction() as conn:
            cursor = conn.execute(
                "UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?",
                (status, self._now(), ticket_id),
            )
            return cursor.rowcount > 0

    def get_admin_module_stats(self, date_from: str = "", date_to: str = "") -> list[sqlite3.Row]:
        conn = self.connect()
        try:
            period_clause = "WHERE substr(created_at, 1, 10) BETWEEN ? AND ?" if date_from and date_to else ""
            params = (date_from, date_to) if date_from and date_to else ()
            return conn.execute(
                f"""
                SELECT module, COUNT(*) AS total
                FROM request_history
                {period_clause}
                GROUP BY module
                ORDER BY total DESC
                """,
                params,
            ).fetchall()
        finally:
            conn.close()

    def get_admin_daily_stats(self, date_from: str, date_to: str) -> list[sqlite3.Row]:
        conn = self.connect()
        try:
            params = (date_from, date_to) * 6
            return conn.execute(
                """
                SELECT day,
                       SUM(new_users) AS new_users,
                       SUM(requests) AS requests,
                       SUM(active_users) AS active_users,
                       SUM(revenue) AS revenue,
                       SUM(succeeded_payments) AS succeeded_payments,
                       SUM(sparks_charged) AS sparks_charged,
                       SUM(sparks_added) AS sparks_added,
                       SUM(tickets_opened) AS tickets_opened
                FROM (
                    SELECT substr(created_at,1,10) AS day, COUNT(*) AS new_users, 0 AS requests, 0 AS active_users,
                           0 AS revenue, 0 AS succeeded_payments, 0 AS sparks_charged, 0 AS sparks_added, 0 AS tickets_opened
                    FROM users WHERE substr(created_at,1,10) BETWEEN ? AND ? GROUP BY 1
                    UNION ALL
                    SELECT substr(created_at,1,10), 0, COUNT(*), COUNT(DISTINCT user_id), 0, 0, 0, 0, 0
                    FROM request_history WHERE substr(created_at,1,10) BETWEEN ? AND ? GROUP BY 1
                    UNION ALL
                    SELECT substr(created_at,1,10), 0, 0, 0, COALESCE(SUM(amount), 0), COUNT(*), 0, 0, 0
                    FROM payments WHERE status='succeeded' AND substr(created_at,1,10) BETWEEN ? AND ? GROUP BY 1
                    UNION ALL
                    SELECT substr(created_at,1,10), 0, 0, 0, 0, 0, COALESCE(SUM(ABS(amount)), 0), 0, 0
                    FROM transactions WHERE amount < 0 AND substr(created_at,1,10) BETWEEN ? AND ? GROUP BY 1
                    UNION ALL
                    SELECT substr(created_at,1,10), 0, 0, 0, 0, 0, 0, COALESCE(SUM(amount), 0), 0
                    FROM transactions WHERE amount > 0 AND substr(created_at,1,10) BETWEEN ? AND ? GROUP BY 1
                    UNION ALL
                    SELECT substr(created_at,1,10), 0, 0, 0, 0, 0, 0, 0, COUNT(*)
                    FROM support_tickets WHERE substr(created_at,1,10) BETWEEN ? AND ? GROUP BY 1
                )
                GROUP BY day
                ORDER BY day
                """,
                params,
            ).fetchall()
        finally:
            conn.close()

    def get_admin_payment_stats(self, date_from: str, date_to: str) -> list[sqlite3.Row]:
        conn = self.connect()
        try:
            return conn.execute(
                """
                SELECT substr(created_at,1,10) AS day, status, COUNT(*) AS total, COALESCE(SUM(amount), 0) AS amount
                FROM payments
                WHERE substr(created_at,1,10) BETWEEN ? AND ?
                GROUP BY day, status
                ORDER BY day
                """,
                (date_from, date_to),
            ).fetchall()
        finally:
            conn.close()

    def get_admin_spark_stats(self, date_from: str, date_to: str) -> list[sqlite3.Row]:
        conn = self.connect()
        try:
            return conn.execute(
                """
                SELECT substr(created_at,1,10) AS day, type, reason, COUNT(*) AS total, COALESCE(SUM(amount), 0) AS amount
                FROM transactions
                WHERE substr(created_at,1,10) BETWEEN ? AND ?
                GROUP BY day, type, reason
                ORDER BY day DESC, total DESC
                """,
                (date_from, date_to),
            ).fetchall()
        finally:
            conn.close()

    def get_admin_provider_stats(self, date_from: str, date_to: str) -> list[sqlite3.Row]:
        conn = self.connect()
        try:
            return conn.execute(
                """
                SELECT provider, COUNT(*) AS total
                FROM users
                WHERE substr(created_at,1,10) BETWEEN ? AND ?
                GROUP BY provider
                ORDER BY total DESC
                """,
                (date_from, date_to),
            ).fetchall()
        finally:
            conn.close()

    def get_admin_top_users(self, date_from: str, date_to: str, limit: int = 10) -> list[sqlite3.Row]:
        conn = self.connect()
        try:
            return conn.execute(
                """
                SELECT u.id, u.username, u.provider, COUNT(rh.id) AS requests_total
                FROM request_history rh
                JOIN users u ON u.id = rh.user_id
                WHERE substr(rh.created_at,1,10) BETWEEN ? AND ?
                GROUP BY u.id
                ORDER BY requests_total DESC
                LIMIT ?
                """,
                (date_from, date_to, limit),
            ).fetchall()
        finally:
            conn.close()

    def get_app_meta(self, key: str) -> str | None:
        conn = self.connect()
        try:
            row = conn.execute("SELECT value FROM app_meta WHERE key = ?", (key,)).fetchone()
            return str(row["value"]) if row else None
        finally:
            conn.close()

    def set_app_meta(self, key: str, value: str) -> None:
        now = self._now()
        with self.transaction() as conn:
            conn.execute(
                """
                INSERT INTO app_meta (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = excluded.updated_at
                """,
                (key, value, now),
            )

    def list_all_users_for_daily_grant(self) -> list[sqlite3.Row]:
        conn = self.connect()
        try:
            return conn.execute("SELECT id, provider, credits FROM users ORDER BY id ASC").fetchall()
        finally:
            conn.close()

    def list_telegram_users_for_notify(self) -> list[sqlite3.Row]:
        conn = self.connect()
        try:
            return conn.execute(
                """
                SELECT id, provider_user_id, username, language, credits
                FROM users
                WHERE provider = 'telegram'
                ORDER BY id ASC
                """
            ).fetchall()
        finally:
            conn.close()


db = Database(settings.database_path)

