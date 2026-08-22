from __future__ import annotations

import asyncio
import logging
from io import BytesIO
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, InputFile, Update, WebAppInfo
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)

from config import settings


logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

ADMIN_WAIT_PASSWORD = 1


def _append_telegram_query(url: str, lang: str) -> str:
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query.setdefault("platform", "telegram")
    query.setdefault("lang", lang)
    return urlunparse(parsed._replace(query=urlencode(query)))


def build_webapp_url(lang: str) -> str:
    # Allow per-bot URL override via env, fallback to default /client URL.
    if lang == "en" and settings.telegram_webapp_url_en:
        return _append_telegram_query(settings.telegram_webapp_url_en, lang)
    if lang == "ru" and settings.telegram_webapp_url_ru:
        return _append_telegram_query(settings.telegram_webapp_url_ru, lang)
    # Open the client route directly to avoid falling back to guest landing.
    return _append_telegram_query(settings.client_base_url, lang)


def _append_tglink_query(url: str, link_token: str) -> str:
    parsed = urlparse(url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["tglink"] = link_token
    return urlunparse(parsed._replace(query=urlencode(query)))


def _web_login_url_for_user(username: str | None, webapp_url: str) -> str | None:
    from app.web.auth.telegram_auth import (
        is_telegram_username_link_configured,
        issue_telegram_username_link_token,
    )

    if not is_telegram_username_link_configured():
        return None
    if not username:
        return None
    try:
        return _append_tglink_query(webapp_url, issue_telegram_username_link_token(username))
    except Exception as exc:  # noqa: BLE001 — invalid stored username, etc.
        logger.info("Web login link skipped: %s", exc)
        return None


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return

    webapp_url = context.bot_data["webapp_url"]
    start_text = context.bot_data["start_text"]

    user = update.effective_user
    # Mini App auth uses Telegram.WebApp.initData; do not attach tglink here —
    # username links are for browser login and fail for first-time users.
    target_url = webapp_url
    _ = user  # reserved for future personalization
    button_text = start_text

    keyboard = InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton(
                    text=button_text,
                    web_app=WebAppInfo(url=target_url),
                )
            ]
        ]
    )
    await update.message.reply_text(start_text, reply_markup=keyboard)


async def admin_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    if not update.message:
        return ConversationHandler.END
    await update.message.reply_text("Введите пароль админа:")
    return ADMIN_WAIT_PASSWORD


async def admin_password_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    if not update.message:
        return ConversationHandler.END

    password = (update.message.text or "").strip()
    expected = (settings.telegram_admin_password or "").strip()
    if not expected or password != expected:
        await update.message.reply_text("Неверный пароль.")
        return ConversationHandler.END

    await update.message.reply_text("Пароль принят. Готовлю PDF-отчёт…")
    try:
        pdf_bytes, filename = await asyncio.to_thread(_build_admin_pdf)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to build admin stats PDF")
        await update.message.reply_text("Не удалось сформировать PDF. Попробуйте позже.")
        return ConversationHandler.END

    await update.message.reply_document(
        document=InputFile(BytesIO(pdf_bytes), filename=filename),
        caption="Полная выкладка статистики Astrolhub (как в админ-панели).",
    )
    return ConversationHandler.END


async def admin_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    if update.message:
        await update.message.reply_text("Отменено.")
    return ConversationHandler.END


def _build_admin_pdf() -> tuple[bytes, str]:
    from app.web.services.admin_stats_pdf import admin_pdf_filename, build_admin_stats_pdf

    days = max(1, int(getattr(settings, "telegram_admin_stats_days", 30) or 30))
    return build_admin_stats_pdf(days=days), admin_pdf_filename()


def _admin_conversation() -> ConversationHandler:
    return ConversationHandler(
        entry_points=[CommandHandler("admin", admin_command)],
        states={
            ADMIN_WAIT_PASSWORD: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, admin_password_received),
            ],
        },
        fallbacks=[CommandHandler("cancel", admin_cancel)],
        allow_reentry=True,
    )


async def _run(
    token: str,
    lang: str,
    start_text: str,
) -> None:
    if not token:
        raise RuntimeError("Telegram bot token is empty. Set it in .env first.")

    application = Application.builder().token(token).build()
    application.bot_data["webapp_url"] = build_webapp_url(lang)
    application.bot_data["start_text"] = start_text
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(_admin_conversation())

    logger.info("Telegram bot started (%s)", lang)
    await application.initialize()
    await application.bot.delete_webhook(drop_pending_updates=False)
    await application.start()
    await application.updater.start_polling(drop_pending_updates=False)

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
        lang="ru",
        start_text="открыть мини-приложение",
    )


async def run_en() -> None:
    await _run(
        token=settings.telegram_bot_token_en,
        lang="en",
        start_text="Welcome!",
    )


if __name__ == "__main__":
    asyncio.run(run())
