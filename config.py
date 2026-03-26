from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv


load_dotenv()


def _bool_from_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    app_host: str = os.getenv("APP_HOST", "0.0.0.0")
    app_port: int = int(os.getenv("PORT", os.getenv("APP_PORT", "8000")))
    app_base_url: str = os.getenv("APP_BASE_URL", "https://example.com").rstrip("/")
    app_title: str = os.getenv("APP_TITLE", "Mini App for Telegram and MAX")

    telegram_bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    telegram_button_text: str = os.getenv("TELEGRAM_BUTTON_TEXT", "Open mini app")

    max_bot_token: str = os.getenv("MAX_BOT_TOKEN", "")
    max_api_base_url: str = os.getenv("MAX_API_BASE_URL", "https://api.max.example").rstrip("/")
    max_button_text: str = os.getenv("MAX_BUTTON_TEXT", "Open mini app")
    max_polling_enabled: bool = _bool_from_env("MAX_POLLING_ENABLED", True)
    run_telegram_bot: bool = _bool_from_env("RUN_TELEGRAM_BOT", True)
    run_max_bot: bool = _bool_from_env("RUN_MAX_BOT", True)


settings = Settings()
