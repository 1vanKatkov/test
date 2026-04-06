import os
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

APP_NAME = "Max Web App"
DEBUG = os.getenv("DEBUG", "0") == "1"
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8010"))

DATABASE_PATH = Path(os.getenv("DATABASE_PATH", str(BASE_DIR / "data" / "max_web_app.db")))
DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
MODEL_SONNIK = os.getenv("MODEL_SONNIK", "@preset/sonnik")
MODEL_SOVMESTIMOST = os.getenv("MODEL_SOVMESTIMOST", "@preset/sovmestimost")
MODEL_TAROT = os.getenv("MODEL_TAROT", "@preset/sonnik")

STARTING_CREDITS = int(os.getenv("STARTING_CREDITS", "5"))
COST_SONNIK = int(os.getenv("COST_SONNIK", "5"))
COST_NUMEROLOGY = int(os.getenv("COST_NUMEROLOGY", "5"))
COST_SOVMESTIMOST = int(os.getenv("COST_SOVMESTIMOST", "5"))
COST_TAROT = int(os.getenv("COST_TAROT", "5"))

MAX_AUTH_SECRET = os.getenv("MAX_AUTH_SECRET", "")
MAX_AUTH_SKEW_SECONDS = int(os.getenv("MAX_AUTH_SKEW_SECONDS", "300"))

NUMEROLOGY_DIR = BASE_DIR.parent / "numerology"
REPORTS_DIR = BASE_DIR / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)
