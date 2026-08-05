from __future__ import annotations

import asyncio
import logging
import threading

import uvicorn

from bots.max_bot import run_polling as run_max_polling
from bots.telegram_bot import run as run_telegram_bot
from bots.telegram_bot import run_en as run_telegram_bot_en
from config import settings


logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


async def daily_sparks_loop() -> None:
    from app.web.services.daily_sparks import run_daily_sparks_cycle

    interval = max(60, int(getattr(settings, "daily_sparks_check_seconds", 3600) or 3600))
    # Small startup delay so DB init / bots settle first.
    await asyncio.sleep(15)
    while True:
        try:
            result = await run_daily_sparks_cycle()
            logger.info("Daily sparks cycle: %s", result)
        except Exception:  # noqa: BLE001
            logger.exception("Daily sparks cycle failed")
        await asyncio.sleep(interval)


async def main() -> None:
    tasks: list[asyncio.Task] = []

    if settings.run_telegram_bot:
        logger.info("Starting Telegram bot in-process")
        tasks.append(asyncio.create_task(run_telegram_bot(), name="telegram-bot"))
    else:
        logger.info("Telegram bot is disabled by RUN_TELEGRAM_BOT=false")

    if settings.run_telegram_bot_en and settings.telegram_bot_token_en:
        logger.info("Starting English Telegram bot in-process")
        tasks.append(asyncio.create_task(run_telegram_bot_en(), name="telegram-bot-en"))
    elif settings.run_telegram_bot_en:
        logger.info("English Telegram bot is enabled but TELEGRAM_BOT_TOKEN_EN is empty")
    else:
        logger.info("English Telegram bot is disabled by RUN_TELEGRAM_BOT_EN=false")

    if settings.run_max_bot:
        logger.info("Starting MAX bot in daemon thread")
        max_thread = threading.Thread(target=run_max_polling, name="max-bot", daemon=True)
        max_thread.start()
    else:
        logger.info("MAX bot is disabled by RUN_MAX_BOT=false")

    if settings.daily_sparks_enabled:
        logger.info(
            "Starting daily sparks loop (+%s / %ss, notify every %s day(s))",
            settings.daily_sparks_amount,
            settings.daily_sparks_check_seconds,
            settings.daily_notify_interval_days,
        )
        tasks.append(asyncio.create_task(daily_sparks_loop(), name="daily-sparks"))
    else:
        logger.info("Daily sparks loop is disabled by DAILY_SPARKS_ENABLED=false")

    logger.info("Starting FastAPI on %s:%s", settings.app_host, settings.app_port)
    config = uvicorn.Config(
        "app.server:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=False,
    )
    server = uvicorn.Server(config)

    try:
        await server.serve()
    finally:
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)


if __name__ == "__main__":
    asyncio.run(main())
