"""
Скрипт: выдать по 100 искр пользователям DiFit, Margaret1511, DAKUDATI
в каждом боте (sonnik, numerology, sovmestimost).
Если пользователь уже есть в базе — добавляем 100 к балансу.
Если его нет — создаём запись с балансом 100 (telegram_id из других баз или из TELEGRAM_IDS ниже).
"""
import sqlite3
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
USERNAMES = ["DiFit", "Margaret1511", "DAKUDATI"]
SPARKS_ADD = 100

# Если пользователя нет ни в одной базе — укажите telegram_id (узнать: написать @userinfobot в Telegram).
TELEGRAM_IDS = {
    "DiFit": None,
    "Margaret1511": None,
    "DAKUDATI": None,
}

# Базы: (путь, название)
DATABASES = [
    (ROOT / "sonnik" / "sonnik_users.db", "sonnik"),
    (ROOT / "numerology" / "sonnik_users.db", "numerology"),
    (ROOT / "sovmestimost" / "sonnik_users.db", "sovmestimost"),
]


def norm(s: str) -> str:
    return (s or "").strip().lower().lstrip("@")


def find_by_username(db_path: Path, username_norm: str):
    if not db_path.exists():
        return None
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT telegram_id, username, credits FROM users WHERE LOWER(TRIM(REPLACE(COALESCE(username,''), '@', ''))) = ?",
            (username_norm,),
        ).fetchone()
        return dict(row) if row else None


def collect_telegram_ids():
    """По всем базам и TELEGRAM_IDS собрать telegram_id для каждого username."""
    mapping = {}  # username_norm -> telegram_id
    for db_path, name in DATABASES:
        if not db_path.exists():
            continue
        with sqlite3.connect(db_path) as conn:
            for uname in USERNAMES:
                n = norm(uname)
                if n in mapping:
                    continue
                row = conn.execute(
                    "SELECT telegram_id FROM users WHERE LOWER(TRIM(REPLACE(COALESCE(username,''), '@', ''))) = ?",
                    (n,),
                ).fetchone()
                if row:
                    mapping[n] = row[0]
    for uname, tid in TELEGRAM_IDS.items():
        if tid is not None:
            n = norm(uname)
            mapping[n] = tid
    return mapping


def _now():
    return datetime.now(timezone.utc).isoformat()


def ensure_columns_sonnik(conn):
    cur = conn.execute("PRAGMA table_info(users)")
    cols = {r[1] for r in cur.fetchall()}
    now = _now()
    if "updated_at" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN updated_at TEXT")
    if "created_at" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN created_at TEXT")
    if "language" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'ru'")
    conn.commit()
    return now


def ensure_columns_numerology(conn):
    cur = conn.execute("PRAGMA table_info(users)")
    cols = {r[1] for r in cur.fetchall()}
    now = _now()
    if "updated_at" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN updated_at TEXT")
    if "created_at" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN created_at TEXT")
    conn.commit()
    return now


def ensure_columns_sovmestimost(conn):
    cur = conn.execute("PRAGMA table_info(users)")
    cols = {r[1] for r in cur.fetchall()}
    now = _now()
    if "created_at" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN created_at TEXT")
    if "language" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'ru'")
    conn.commit()
    return now


def process_sonnik(db_path: Path, name: str, id_map: dict):
    if not db_path.exists():
        print(f"  [{name}] DB не найдена: {db_path}")
        return
    now = _now()
    with sqlite3.connect(db_path) as conn:
        ensure_columns_sonnik(conn)
        for uname in USERNAMES:
            n = norm(uname)
            tid = id_map.get(n)
            row = find_by_username(db_path, n)
            if row:
                new_credits = (row["credits"] or 0) + SPARKS_ADD
                conn.execute(
                    "UPDATE users SET credits = ?, username = ?, updated_at = ? WHERE telegram_id = ?",
                    (new_credits, uname, now, row["telegram_id"]),
                )
                print(f"  [{name}] {uname} (id={row['telegram_id']}): искр было {row['credits']}, стало {new_credits}")
            elif tid is not None:
                conn.execute(
                    """INSERT INTO users (telegram_id, username, credits, created_at, updated_at, language)
                       VALUES (?, ?, ?, ?, ?, 'ru')""",
                    (tid, uname, SPARKS_ADD, now, now),
                )
                print(f"  [{name}] {uname} (id={tid}): создан с балансом {SPARKS_ADD}")
            else:
                print(f"  [{name}] {uname}: не найден в базах, пропуск (нужен telegram_id)")


def process_numerology(db_path: Path, name: str, id_map: dict):
    if not db_path.exists():
        print(f"  [{name}] DB не найдена: {db_path}")
        return
    now = _now()
    with sqlite3.connect(db_path) as conn:
        ensure_columns_numerology(conn)
        for uname in USERNAMES:
            n = norm(uname)
            tid = id_map.get(n)
            row = find_by_username(db_path, n)
            if row:
                new_credits = (row["credits"] or 0) + SPARKS_ADD
                conn.execute(
                    "UPDATE users SET credits = ?, username = ?, updated_at = ? WHERE telegram_id = ?",
                    (new_credits, uname, now, row["telegram_id"]),
                )
                print(f"  [{name}] {uname} (id={row['telegram_id']}): искр было {row['credits']}, стало {new_credits}")
            elif tid is not None:
                conn.execute(
                    "INSERT INTO users (telegram_id, username, credits, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                    (tid, uname, SPARKS_ADD, now, now),
                )
                print(f"  [{name}] {uname} (id={tid}): создан с балансом {SPARKS_ADD}")
            else:
                print(f"  [{name}] {uname}: не найден в базах, пропуск (нужен telegram_id)")


def process_sovmestimost(db_path: Path, name: str, id_map: dict):
    if not db_path.exists():
        print(f"  [{name}] DB не найдена: {db_path}")
        return
    now = _now()
    with sqlite3.connect(db_path) as conn:
        ensure_columns_sovmestimost(conn)
        for uname in USERNAMES:
            n = norm(uname)
            tid = id_map.get(n)
            row = find_by_username(db_path, n)
            if row:
                new_credits = (row["credits"] or 0) + SPARKS_ADD
                conn.execute(
                    "UPDATE users SET credits = ?, username = ? WHERE telegram_id = ?",
                    (new_credits, uname, row["telegram_id"]),
                )
                print(f"  [{name}] {uname} (id={row['telegram_id']}): искр было {row['credits']}, стало {new_credits}")
            elif tid is not None:
                conn.execute(
                    "INSERT INTO users (telegram_id, username, credits, created_at, language) VALUES (?, ?, ?, ?, 'ru')",
                    (tid, uname, SPARKS_ADD, now),
                )
                print(f"  [{name}] {uname} (id={tid}): создан с балансом {SPARKS_ADD}")
            else:
                print(f"  [{name}] {uname}: не найден в базах, пропуск (нужен telegram_id)")


def main():
    print("Пользователи:", USERNAMES)
    print("Добавляем по", SPARKS_ADD, "искр в каждом боте.\n")
    id_map = collect_telegram_ids()
    if id_map:
        print("Найденные telegram_id по username:", id_map, "\n")
    else:
        print("В базах не найдено ни одного из этих username. Создать новых нельзя без telegram_id.\n")

    for db_path, name in DATABASES:
        print(f"--- {name} ---")
        if name == "sonnik":
            process_sonnik(db_path, name, id_map)
        elif name == "numerology":
            process_numerology(db_path, name, id_map)
        else:
            process_sovmestimost(db_path, name, id_map)
    print("\nГотово.")


if __name__ == "__main__":
    main()
