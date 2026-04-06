"""Разовая отправка сообщения пользователю по username (бот Сонник)."""
import asyncio
import os
import sqlite3
from pathlib import Path
from dotenv import load_dotenv
from telegram.ext import Application

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
load_dotenv(BASE_DIR / ".env")

SONNIK_DB = ROOT_DIR / "sonnik" / "sonnik_users.db"
NUMEROLOGY_DB = ROOT_DIR / "numerology" / "sonnik_users.db"
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")


def get_telegram_id_by_username(username: str) -> int | None:
    """Ищем telegram_id в БД сонника и нумерологии (без @)."""
    name = username.lstrip("@").lower()
    for db_path in (SONNIK_DB, NUMEROLOGY_DB):
        if not db_path.exists():
            continue
        try:
            with sqlite3.connect(db_path) as conn:
                row = conn.execute(
                    "SELECT telegram_id FROM users WHERE LOWER(TRIM(REPLACE(username, '@', ''))) = ?",
                    (name,),
                ).fetchone()
                if row:
                    return int(row[0])
        except Exception:
            pass
    return None


async def main():
    username = "balakin_as"
    text = """Небольшой технический сбой помешал некоторым расшифровкам дойти до вас 😢
Мне очень жаль, если вы столкнулись с этим

Сейчас всё работает корректно.
Если вы не получили свой разбор - просто отправьте сон ещё раз, и я обязательно всё проверю и разберу 🙏"""

    chat_id = get_telegram_id_by_username(username)
    if not chat_id:
        print(f"Пользователь {username} не найден в БД сонника/нумерологии. Укажите TELEGRAM_ID в скрипте или пусть пользователь напишет боту /start.")
        return
    if not TOKEN:
        print("TELEGRAM_BOT_TOKEN не задан в .env")
        return
    app = Application.builder().token(TOKEN).build()
    try:
        await app.bot.send_message(chat_id=chat_id, text=text)
        print(f"Сообщение отправлено пользователю {username} (id={chat_id})")
    except Exception as e:
        print(f"Ошибка отправки: {e}")
    await app.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
