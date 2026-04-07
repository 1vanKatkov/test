from __future__ import annotations

import logging
import time
from typing import Any

import requests

from config import settings


logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


class MaxBotClient:
    """
    A minimal MAX messenger bot client with Telegram-style Bot API endpoints.
    You can adjust MAX_API_BASE_URL if your MAX API gateway differs.
    """

    def __init__(self) -> None:
        if not settings.max_bot_token:
            raise RuntimeError("MAX_BOT_TOKEN is empty. Set it in .env first.")
        self.base_url = f"{settings.max_api_base_url}/bot{settings.max_bot_token}"
        self.timeout = 30

    def _request(self, method: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        url = f"{self.base_url}/{method}"
        response = requests.post(url, json=payload or {}, timeout=self.timeout)
        response.raise_for_status()
        data = response.json()
        if not data.get("ok", True):
            raise RuntimeError(f"MAX API error on {method}: {data}")
        return data

    def get_updates(self, offset: int | None = None) -> list[dict[str, Any]]:
        payload: dict[str, Any] = {"timeout": self.timeout}
        if offset is not None:
            payload["offset"] = offset
        data = self._request("getUpdates", payload)
        return data.get("result", [])

    def send_welcome(self, chat_id: int, user_name: str | None) -> None:
        display_name = user_name or "Unknown user"
        mini_app_url = (
            f"{settings.app_base_url}/client"
            f"?platform=max&lang=ru&name={requests.utils.quote(display_name)}"
        )
        payload = {
            "chat_id": chat_id,
            "text": "Open mini app:",
            "reply_markup": {
                "inline_keyboard": [
                    [
                        {
                            "text": settings.max_button_text,
                            "web_app": {"url": mini_app_url},
                        }
                    ]
                ]
            },
        }
        self._request("sendMessage", payload)


def run_polling() -> None:
    client = MaxBotClient()
    offset: int | None = None
    logger.info("MAX bot polling started")

    while settings.max_polling_enabled:
        try:
            updates = client.get_updates(offset=offset)
            for update in updates:
                offset = int(update["update_id"]) + 1
                message = update.get("message", {})
                text = (message.get("text") or "").strip()
                if text != "/start":
                    continue

                chat_id = message.get("chat", {}).get("id")
                user_name = message.get("from", {}).get("first_name")
                if chat_id is None:
                    continue

                client.send_welcome(chat_id=int(chat_id), user_name=user_name)
        except requests.RequestException as exc:
            logger.warning("MAX polling request failed: %s", exc)
            time.sleep(2)
        except Exception as exc:
            logger.exception("MAX polling failed: %s", exc)
            time.sleep(2)


if __name__ == "__main__":
    run_polling()
