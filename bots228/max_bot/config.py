import os
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8020"))

MAX_BOT_TOKEN = os.getenv("MAX_BOT_TOKEN", "")
MAX_BOT_WEBHOOK_SECRET = os.getenv("MAX_BOT_WEBHOOK_SECRET", "")
MAX_WEB_APP_URL = os.getenv("MAX_WEB_APP_URL", "http://localhost:8010")
MAX_API_BASE_URL = os.getenv("MAX_API_BASE_URL", "https://api.max.example")

MAX_SEND_MESSAGE_PATH = os.getenv("MAX_SEND_MESSAGE_PATH", "/bot/sendMessage")
