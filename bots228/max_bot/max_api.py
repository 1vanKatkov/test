import logging
from typing import Any

import requests

from config import MAX_API_BASE_URL, MAX_BOT_TOKEN, MAX_SEND_MESSAGE_PATH


logger = logging.getLogger(__name__)


class MaxApiClient:
    def __init__(self) -> None:
        self.base_url = MAX_API_BASE_URL.rstrip("/")
        self.token = MAX_BOT_TOKEN
        self.send_message_path = MAX_SEND_MESSAGE_PATH

    @staticmethod
    def build_open_app_button(url: str, title: str = "Открыть приложение") -> dict[str, Any]:
        return {
            "text": title,
            "type": "web_app",
            "web_app": {"url": url},
        }

    def send_message(self, chat_id: str, text: str, buttons: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        if not self.token:
            raise RuntimeError("MAX_BOT_TOKEN is not configured")

        endpoint = f"{self.base_url}{self.send_message_path}"
        payload: dict[str, Any] = {"chat_id": chat_id, "text": text}
        if buttons:
            payload["reply_markup"] = {"inline_keyboard": [buttons]}

        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }
        try:
            response = requests.post(endpoint, headers=headers, json=payload, timeout=15)
            response.raise_for_status()
            data = response.json() if response.content else {"ok": True}
            return data
        except requests.RequestException as exc:
            logger.error("Max API request failed: %s", exc)
            raise RuntimeError("Failed to send message to Max API") from exc
