"""
Рассылка пользователям сонника: приглашение в бота нумерологии.
Запуск: python broadcast_cross_promo.py
"""
import os
import sqlite3
import asyncio
import logging
from pathlib import Path

from telegram import InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application
from telegram.error import Forbidden

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
USER_DB_PATH = BASE_DIR / "sonnik_users.db"

load_dotenv(BASE_DIR / ".env")
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

MESSAGE = """Иногда сон показывает не просто эмоцию,
а период, в котором вы сейчас находитесь.

Чтобы понять корень происходящего,
можно посмотреть ваш текущий жизненный цикл по нумерологии."""

BUTTON_URL = "https://t.me/kodsudbblybot"
BUTTON_TEXT = "Посмотреть период"


def get_all_user_ids() -> list[int]:
    """Получить telegram_id всех пользователей сонника."""
    if not USER_DB_PATH.exists():
        logger.error(f"База не найдена: {USER_DB_PATH}")
        return []
    with sqlite3.connect(USER_DB_PATH) as conn:
        rows = conn.execute("SELECT telegram_id FROM users").fetchall()
        return [r[0] for r in rows]


async def send_to_user(bot, user_id: int) -> bool:
    try:
        keyboard = [[InlineKeyboardButton(BUTTON_TEXT, url=BUTTON_URL)]]
        await bot.send_message(
            chat_id=user_id,
            text=MESSAGE,
            reply_markup=InlineKeyboardMarkup(keyboard),
        )
        return True
    except Forbidden:
        logger.warning(f"Пользователь {user_id} заблокировал бота")
        return False
    except Exception as e:
        logger.error(f"Ошибка отправки {user_id}: {e}")
        return False


async def main():
    if not TOKEN:
        logger.error("TELEGRAM_BOT_TOKEN не задан в sonnik/.env")
        return
    user_ids = get_all_user_ids()
    logger.info(f"Найдено {len(user_ids)} пользователей сонника")
    if not user_ids:
        return
    app = Application.builder().token(TOKEN).build()
    ok, fail = 0, 0
    for uid in user_ids:
        if await send_to_user(app.bot, uid):
            ok += 1
        else:
            fail += 1
        await asyncio.sleep(0.15)
    logger.info(f"Готово. Успешно: {ok}, Ошибок: {fail}")


if __name__ == "__main__":
    asyncio.run(main())
