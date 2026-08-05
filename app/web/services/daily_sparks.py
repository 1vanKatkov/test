from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from telegram import Bot
from telegram.error import TelegramError

from app.web.db import db
from app.web.services.balance import credit
from config import settings

logger = logging.getLogger(__name__)

MOSCOW_TZ = ZoneInfo("Europe/Moscow")

META_LAST_GRANT_DATE = "daily_sparks_last_grant_date"
META_LAST_NOTIFY_DATE = "daily_sparks_last_notify_date"
META_NOTIFY_INDEX = "daily_sparks_notify_index"

DAILY_SPARKS_MESSAGES_RU: list[str] = [
    "✨ Вам начислено {sparks} ✦!\nПопробуйте новые разборы — сонник, таро или совместимость.\n\nВаш баланс: {balance} ✦",
    "🌙 Доброе утро от Astrolhub!\nНа баланс добавлено {sparks} ✦.\nЧто вам сегодня приснилось? Разберите сон в мини-приложении.\n\nБаланс: {balance} ✦",
    "🔮 Вам начислено {sparks} ✦.\nЗагляните в новые разборы — нумерология и натальная карта уже ждут.\n\nВаш баланс — {balance} ✦",
    "⭐ Ежедневный бонус: +{sparks} ✦\nПопробуйте расклад Таро или проверку совместимости.\n\nСейчас у вас {balance} ✦",
    "💫 Вам начислено {sparks} искры.\nВаш баланс — {balance} ✦.\nЧто вам сегодня приснилось?",
    "🌟 Astrolhub подарил вам {sparks} ✦.\nОткройте приложение и сделайте короткий разбор дня.\n\nБаланс: {balance} ✦",
    "🕯️ +{sparks} ✦ уже на счёте.\nПопробуйте новые разборы — особенно если есть важный вопрос.\n\nВаш баланс: {balance} ✦",
    "🌕 Вам начислено {sparks} ✦.\nСон, числа или карты — выберите, что ближе сегодня.\n\nБаланс — {balance} ✦",
    "🪐 Ежедневные искры: +{sparks} ✦\nВаш баланс — {balance} ✦.\nЗагляните в Astrolhub за свежим разбором.",
    "🌠 Вам начислено {sparks} ✦!\nПопробуйте совместимость или карту дня.\n\nТекущий баланс: {balance} ✦",
    "🪞 +{sparks} ✦ на балансе.\nЧто вам сегодня приснилось? Можно разобрать прямо сейчас.\n\nБаланс: {balance} ✦",
    "🎴 Вам начислено {sparks} ✦.\nНовые разборы уже доступны — ваш баланс {balance} ✦.",
]

DAILY_SPARKS_MESSAGES_EN: list[str] = [
    "✨ You received {sparks} ✦!\nTry a new reading — dreams, tarot, or compatibility.\n\nYour balance: {balance} ✦",
    "🌙 Good day from Astrolhub!\n+{sparks} ✦ added to your balance.\nWhat did you dream about today?\n\nBalance: {balance} ✦",
    "🔮 You received {sparks} ✦.\nExplore numerology or a natal chart reading.\n\nYour balance is {balance} ✦",
    "⭐ Daily bonus: +{sparks} ✦\nTry a tarot spread or a compatibility check.\n\nYou now have {balance} ✦",
    "💫 +{sparks} ✦ credited.\nYour balance is {balance} ✦.\nWhat did you dream about today?",
    "🌟 Astrolhub gifted you {sparks} ✦.\nOpen the app for a quick reading.\n\nBalance: {balance} ✦",
]


def _today_moscow() -> date:
    return datetime.now(MOSCOW_TZ).date()


def _parse_iso_date(value: str | None) -> date | None:
    raw = (value or "").strip()
    if not raw:
        return None
    try:
        return date.fromisoformat(raw[:10])
    except ValueError:
        return None


def _message_templates(language: str) -> list[str]:
    if (language or "").strip().lower() == "en":
        return DAILY_SPARKS_MESSAGES_EN
    return DAILY_SPARKS_MESSAGES_RU


def pick_notification_text(language: str, index: int, sparks: int, balance: int) -> str:
    templates = _message_templates(language)
    template = templates[index % len(templates)]
    return template.format(sparks=sparks, balance=balance)


def grant_daily_sparks_if_needed(today: date | None = None) -> dict:
    """Grant daily sparks once per Moscow calendar day to every user."""
    amount = max(0, int(getattr(settings, "daily_sparks_amount", 3) or 0))
    if amount <= 0 or not getattr(settings, "daily_sparks_enabled", True):
        return {"granted": False, "reason": "disabled", "users": 0}

    day = today or _today_moscow()
    last = _parse_iso_date(db.get_app_meta(META_LAST_GRANT_DATE))
    if last == day:
        return {"granted": False, "reason": "already_granted", "users": 0, "date": day.isoformat()}

    users = db.list_all_users_for_daily_grant()
    credited = 0
    for user in users:
        user_id = int(user["id"])
        try:
            credit(
                user_id,
                amount,
                "daily_sparks",
                {"date": day.isoformat(), "amount": amount},
                tx_type="daily_credit",
            )
            credited += 1
        except Exception:  # noqa: BLE001
            logger.exception("Daily sparks grant failed for user_id=%s", user_id)

    db.set_app_meta(META_LAST_GRANT_DATE, day.isoformat())
    logger.info("Daily sparks granted: %s users, +%s each (%s)", credited, amount, day.isoformat())
    return {"granted": True, "users": credited, "amount": amount, "date": day.isoformat()}


def should_send_notifications(today: date | None = None) -> bool:
    day = today or _today_moscow()
    interval = max(1, int(getattr(settings, "daily_notify_interval_days", 2) or 2))
    last = _parse_iso_date(db.get_app_meta(META_LAST_NOTIFY_DATE))
    if last is None:
        # Bootstrap cadence on deploy without instantly messaging everyone.
        db.set_app_meta(META_LAST_NOTIFY_DATE, day.isoformat())
        logger.info("Daily TG notify cadence initialized at %s", day.isoformat())
        return False
    return (day - last) >= timedelta(days=interval)


async def send_telegram_notifications_if_needed(today: date | None = None) -> dict:
    """Send rotating TG notifications to telegram users every N days."""
    if not getattr(settings, "daily_sparks_enabled", True):
        return {"sent": False, "reason": "disabled"}
    if not settings.telegram_bot_token:
        return {"sent": False, "reason": "no_token"}

    day = today or _today_moscow()
    if not should_send_notifications(day):
        return {"sent": False, "reason": "too_soon", "date": day.isoformat()}

    amount = max(0, int(getattr(settings, "daily_sparks_amount", 3) or 0))
    index = int(db.get_app_meta(META_NOTIFY_INDEX) or "0")
    users = db.list_telegram_users_for_notify()
    bot = Bot(token=settings.telegram_bot_token)
    ok = 0
    failed = 0

    await bot.initialize()
    try:
        for user in users:
            chat_id = str(user["provider_user_id"] or "").strip()
            if not chat_id.isdigit():
                failed += 1
                continue
            language = (user["language"] or "ru").strip().lower()
            balance = int(user["credits"] or 0)
            text = pick_notification_text(language, index, amount, balance)
            try:
                await bot.send_message(chat_id=int(chat_id), text=text)
                ok += 1
            except TelegramError as exc:
                failed += 1
                logger.info("TG notify failed chat_id=%s: %s", chat_id, exc)
            except Exception:  # noqa: BLE001
                failed += 1
                logger.exception("TG notify unexpected error chat_id=%s", chat_id)
    finally:
        await bot.shutdown()

    db.set_app_meta(META_LAST_NOTIFY_DATE, day.isoformat())
    db.set_app_meta(META_NOTIFY_INDEX, str(index + 1))
    logger.info(
        "Daily TG notifications done: ok=%s failed=%s index=%s date=%s",
        ok,
        failed,
        index,
        day.isoformat(),
    )
    return {"sent": True, "ok": ok, "failed": failed, "index": index, "date": day.isoformat()}


async def run_daily_sparks_cycle() -> dict:
    """Idempotent hourly-safe cycle: daily grants + optional bi-daily TG pings."""
    day = _today_moscow()
    grant_result = grant_daily_sparks_if_needed(day)
    notify_result = await send_telegram_notifications_if_needed(day)
    return {"date": day.isoformat(), "grant": grant_result, "notify": notify_result}
