from __future__ import annotations

import asyncio
import logging

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes

from config import settings


logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


def build_webapp_url(lang: str) -> str:
    # Open the client route directly to avoid falling back to guest landing.
    return f"{settings.app_base_url}/client?platform=telegram&lang={lang}"


def _web_login_url_for_user(telegram_user_id: int) -> str | None:
    from app.web.auth.telegram_auth import (
        is_telegram_username_link_configured,
        issue_telegram_username_login_url,
    )
    from app.web.db import db

    if not is_telegram_username_link_configured():
        return None
    row = db.get_user_by_provider("telegram", str(telegram_user_id))
    if not row or not row["username"]:
        return None
    try:
        return issue_telegram_username_login_url(row["username"])
    except Exception as exc:  # noqa: BLE001 — invalid stored username, etc.
        logger.info("Web login link skipped: %s", exc)
        return None


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return

    button_text = context.bot_data["button_text"]
    webapp_url = context.bot_data["webapp_url"]
    start_text = context.bot_data["start_text"]
    link_label = context.bot_data.get("link_button_text", "")

    rows: list[list[InlineKeyboardButton]] = [
        [
            InlineKeyboardButton(
                text=button_text,
                web_app=WebAppInfo(url=webapp_url),
            )
        ]
    ]
    user = update.effective_user
    if user and link_label:
        link_url = _web_login_url_for_user(user.id)
        if link_url:
            rows.append(
                [
                    InlineKeyboardButton(
                        text=link_label,
                        url=link_url,
                    )
                ]
            )

    keyboard = InlineKeyboardMarkup(rows)
    await update.message.reply_text(start_text, reply_markup=keyboard)


async def _run(
    token: str,
    button_text: str,
    lang: str,
    start_text: str,
    *,
    link_button_text: str = "",
) -> None:
    if not token:
        raise RuntimeError("Telegram bot token is empty. Set it in .env first.")

    application = Application.builder().token(token).build()
    application.bot_data["button_text"] = button_text
    application.bot_data["webapp_url"] = build_webapp_url(lang)
    application.bot_data["start_text"] = start_text
    application.bot_data["link_button_text"] = link_button_text
    application.add_handler(CommandHandler("start", start_command))

    logger.info("Telegram bot started (%s)", lang)
    await application.initialize()
    await application.start()
    await application.updater.start_polling()

    try:
        while True:
            await asyncio.sleep(3600)
    finally:
        await application.updater.stop()
        await application.stop()
        await application.shutdown()


async def run() -> None:
    await _run(
        token=settings.telegram_bot_token,
        button_text=settings.telegram_button_text,
        lang="ru",
        start_text="Добро пожаловать!",
        link_button_text="Войти в веб по ссылке",
    )


async def run_en() -> None:
    await _run(
        token=settings.telegram_bot_token_en,
        button_text=settings.telegram_button_text_en,
        lang="en",
        start_text="Welcome!",
        link_button_text="Open web (signed link)",
    )


if __name__ == "__main__":
    asyncio.run(run())
