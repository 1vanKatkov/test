from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


load_dotenv()
BASE_DIR = Path(__file__).resolve().parent


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
    telegram_bot_token_en: str = os.getenv("TELEGRAM_BOT_TOKEN_EN", "")
    telegram_button_text_en: str = os.getenv("TELEGRAM_BUTTON_TEXT_EN", "Open app")

    max_bot_token: str = os.getenv("MAX_BOT_TOKEN", "")
    max_api_base_url: str = os.getenv("MAX_API_BASE_URL", "https://api.max.example").rstrip("/")
    max_button_text: str = os.getenv("MAX_BUTTON_TEXT", "Open mini app")
    max_polling_enabled: bool = _bool_from_env("MAX_POLLING_ENABLED", True)
    run_telegram_bot: bool = _bool_from_env("RUN_TELEGRAM_BOT", True)
    run_telegram_bot_en: bool = _bool_from_env("RUN_TELEGRAM_BOT_EN", True)
    run_max_bot: bool = _bool_from_env("RUN_MAX_BOT", True)
    dev_auth_bypass: bool = _bool_from_env("DEV_AUTH_BYPASS", False)
    dev_auth_mock_provider_user_id: str = os.getenv("DEV_AUTH_MOCK_PROVIDER_USER_ID", "dev-bypass-user")
    dev_auth_mock_username: str = os.getenv("DEV_AUTH_MOCK_USERNAME", "Dev Tester")
    dev_auth_mock_language: str = os.getenv("DEV_AUTH_MOCK_LANGUAGE", "ru")
    email_auth_secret: str = os.getenv("EMAIL_AUTH_SECRET", "")
    email_auth_ttl_seconds: int = int(os.getenv("EMAIL_AUTH_TTL_SECONDS", "2592000"))
    seed_admin_email: str = os.getenv("SEED_ADMIN_EMAIL", "")
    seed_admin_password: str = os.getenv("SEED_ADMIN_PASSWORD", "")
    seed_user_email: str = os.getenv("SEED_USER_EMAIL", "")
    seed_user_password: str = os.getenv("SEED_USER_PASSWORD", "")
    seed_user_name: str = os.getenv("SEED_USER_NAME", "User")

    # Web services settings (ported from bots228/max_web_app)
    database_path: str = os.getenv("DATABASE_PATH", str(BASE_DIR / "data" / "sonnik_users.db"))
    openrouter_url: str = os.getenv("OPENROUTER_URL", "https://openrouter.ai/api/v1/chat/completions")
    openrouter_api_key: str = os.getenv("OPENROUTER_API_KEY", "")
    model_sonnik: str = os.getenv("MODEL_SONNIK", "@preset/sonnik")
    model_sonnik_en: str = os.getenv("MODEL_SONNIK_EN", "@preset/sonnikeng")
    model_sovmestimost: str = os.getenv("MODEL_SOVMESTIMOST", "@preset/sovmestimost")
    model_sovmestimost_en: str = os.getenv("MODEL_SOVMESTIMOST_EN", "@preset/sovmestimosteng")
    starting_credits: int = int(os.getenv("STARTING_CREDITS", "10"))
    cost_sonnik: int = int(os.getenv("COST_SONNIK", "5"))
    cost_numerology: int = int(os.getenv("COST_NUMEROLOGY", "5"))
    cost_sovmestimost: int = int(os.getenv("COST_SOVMESTIMOST", "5"))
    max_auth_secret: str = os.getenv("MAX_AUTH_SECRET", "")
    max_auth_skew_seconds: int = int(os.getenv("MAX_AUTH_SKEW_SECONDS", "300"))
    telegram_auth_skew_seconds: int = int(os.getenv("TELEGRAM_AUTH_SKEW_SECONDS", "86400"))
    yookassa_shop_id: str = os.getenv("YOOKASSA_SHOP_ID", "")
    yookassa_secret_key: str = os.getenv("YOOKASSA_SECRET_KEY", "")
    yookassa_return_url: str = os.getenv("YOOKASSA_RETURN_URL", "https://t.me/your_bot_username")
    yookassa_receipt_email: str = os.getenv("YOOKASSA_RECEIPT_EMAIL", "")
    yookassa_vat_code: int = int(os.getenv("YOOKASSA_VAT_CODE", "1"))
    yookassa_timeout_seconds: int = int(os.getenv("YOOKASSA_TIMEOUT_SECONDS", "20"))
    yookassa_max_attempts: int = int(os.getenv("YOOKASSA_MAX_ATTEMPTS", "1"))
    numerology_dir: str = os.getenv("NUMEROLOGY_DIR", str(BASE_DIR / "bots228" / "numerology"))
    sovmestimost_messages_path: str = os.getenv(
        "SOVMESTIMOST_MESSAGES_PATH",
        str(BASE_DIR / "bots228" / "sovmestimost" / "messages.json"),
    )
    reports_dir: Path = Path(os.getenv("REPORTS_DIR", str(BASE_DIR / "app" / "reports")))


settings = Settings()
Path(settings.database_path).parent.mkdir(parents=True, exist_ok=True)
settings.reports_dir.mkdir(parents=True, exist_ok=True)
