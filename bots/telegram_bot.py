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


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return

    button_text = context.bot_data["button_text"]
    webapp_url = context.bot_data["webapp_url"]
    start_text = context.bot_data["start_text"]
    keyboard = InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton(
                    text=button_text,
                    web_app=WebAppInfo(url=webapp_url),
                )
            ]
        ]
    )
    await update.message.reply_text(start_text, reply_markup=keyboard)


async def _run(token: str, button_text: str, lang: str, start_text: str) -> None:
    if not token:
        raise RuntimeError("Telegram bot token is empty. Set it in .env first.")

    application = Application.builder().token(token).build()
    application.bot_data["button_text"] = button_text
    application.bot_data["webapp_url"] = build_webapp_url(lang)
    application.bot_data["start_text"] = start_text
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
        start_text="Open mini app:",
    )


async def run_en() -> None:
    await _run(
        token=settings.telegram_bot_token_en,
        button_text=settings.telegram_button_text_en,
        lang="en",
        start_text="Open app:",
    )


if __name__ == "__main__":
    asyncio.run(run())
