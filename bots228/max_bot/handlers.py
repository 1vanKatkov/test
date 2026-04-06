import logging
from typing import Any

from config import MAX_WEB_APP_URL
from max_api import MaxApiClient


logger = logging.getLogger(__name__)

WELCOME_TEXT = (
    "Добро пожаловать.\n"
    "Нажмите кнопку ниже, чтобы открыть приложение."
)


def _extract_chat_id(update: dict[str, Any]) -> str | None:
    # Generic extraction to support slight payload differences.
    return (
        str(update.get("chat_id"))
        if update.get("chat_id") is not None
        else (
            str(update["message"]["chat"]["id"])
            if isinstance(update.get("message"), dict)
            and isinstance(update["message"].get("chat"), dict)
            and update["message"]["chat"].get("id") is not None
            else None
        )
    )


def _is_start_event(update: dict[str, Any]) -> bool:
    text = ""
    if isinstance(update.get("message"), dict):
        text = str(update["message"].get("text", "")).strip().lower()
    if update.get("type") == "start":
        return True
    return text in {"/start", "start"}


def handle_update(update: dict[str, Any], max_client: MaxApiClient) -> dict[str, Any]:
    chat_id = _extract_chat_id(update)
    if not chat_id:
        logger.info("Skip update without chat_id")
        return {"ok": True, "handled": False, "reason": "missing_chat_id"}

    if not _is_start_event(update):
        logger.info("Skip non-start update for chat %s", chat_id)
        return {"ok": True, "handled": False, "reason": "non_start_event"}

    button = max_client.build_open_app_button(MAX_WEB_APP_URL, "Открыть приложение")
    max_client.send_message(chat_id=chat_id, text=WELCOME_TEXT, buttons=[button])
    return {"ok": True, "handled": True}
