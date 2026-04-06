import os
import logging
import asyncio
import random
import re
import sqlite3
import uuid
import json
import argparse
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Optional, List

import requests
from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InputFile,
    Update
)
from telegram.error import Forbidden, BadRequest, TelegramError
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters
)

from dotenv import load_dotenv
from yookassa import Configuration, Payment

# --- Аргументы командной строки ---
def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--token", help="Bot token")
    parser.add_argument("--messages", help="Path to messages.json")
    parser.add_argument("--test", action="store_true", help="Run in test mode (test DB and test Yookassa)")
    parser.add_argument("--lang", help="Force fixed language (ru, en, es)")
    return parser.parse_known_args()[0]

args = parse_args()

# Путь к директории бота
BASE_DIR = Path(__file__).resolve().parent

# Настройка логирования
log_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
log_file = BASE_DIR.parent / "logs" / ("sonnik_bot_test.log" if args.test else "sonnik_bot.log")
(BASE_DIR.parent / "logs").mkdir(exist_ok=True)

from logging.handlers import RotatingFileHandler
file_handler = RotatingFileHandler(log_file, maxBytes=5*1024*1024, backupCount=5, encoding='utf-8')
file_handler.setFormatter(log_formatter)
file_handler.setLevel(logging.INFO)

console_handler = logging.StreamHandler()
console_handler.setFormatter(log_formatter)
console_handler.setLevel(logging.INFO)

logging.basicConfig(level=logging.INFO, handlers=[file_handler, console_handler])
logger = logging.getLogger(__name__)

# Импорты для нумерологии
import sys
numerology_path = BASE_DIR.parent / "numerology"
sys.path.insert(0, str(numerology_path))

try:
    from report_generator import (
        calculate_action_number,
        calculate_character_number,
        calculate_consciousness_number,
        calculate_destiny_number,
        calculate_energy_number,
        generate_numerology_report_pdf,
    )
    NUMEROLOGY_AVAILABLE = True
except ImportError:
    NUMEROLOGY_AVAILABLE = False

load_dotenv()

YOOKASSA_SHOP_ID = os.getenv("YOOKASSA_SHOP_ID_TEST" if args.test else "YOOKASSA_SHOP_ID")
YOOKASSA_SECRET_KEY = os.getenv("YOOKASSA_SECRET_KEY_TEST" if args.test else "YOOKASSA_SECRET_KEY")
YOOKASSA_ACCOUNT_ID = os.getenv("YOOKASSA_ACCOUNT_ID_TEST" if args.test else "YOOKASSA_ACCOUNT_ID")
YOOKASSA_RETURN_URL = os.getenv("YOOKASSA_RETURN_URL", "https://t.me/your_bot_username")
# Тестовый режим Юкассы: если передан флаг --test, принудительно ставим "1"
YOOKASSA_TEST_MODE = "1" if args.test else os.getenv("YOOKASSA_TEST_MODE", "1")

if YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY:
    Configuration.configure(
        shop_id=YOOKASSA_SHOP_ID,
        secret_key=YOOKASSA_SECRET_KEY,
        account_id=YOOKASSA_SHOP_ID,  # account_id обычно совпадает с shop_id
    )

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "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")

def get_model_for_lang(lang: str) -> str:
    """
    Возвращает ID пресета модели для указанного языка.
    Для английского используем отдельный пресет, для остальных — основной.
    """
    if lang == "en":
        return "@preset/sonnikeng"
    return "@preset/sonnik"

# Токен: сначала из аргументов, потом из .env
TELEGRAM_BOT_TOKEN = args.token or os.getenv("TELEGRAM_BOT_TOKEN")

OFFER_FILE_PATH = BASE_DIR / "Публичная оферта.pdf"
# Переключение базы данных в тестовом режиме
USER_DB_PATH = BASE_DIR / ("sonnik_users_test.db" if args.test else "sonnik_users.db")
STARTING_SPARKS = 5
SPARK_COST = 5

SUBSCRIPTION_PACKAGES = {
    "sub_150": {"sparks": 150, "amount": 149, "period_days": 30, "label": "150 искр (1 месяц) — 149₽"},
    "sub_450": {"sparks": 450, "amount": 399, "period_days": 90, "label": "450 искр (3 месяца) — 399₽"},
    "sub_900": {"sparks": 900, "amount": 749, "period_days": 180, "label": "900 искр (6 месяцев) — 749₽"},
}

TOP_UP_PACKAGES = {
    "topup_50": {"sparks": 50, "amount": 100, "label": "50 искр — 100₽"},
    "topup_100": {"sparks": 100, "amount": 200, "label": "100 искр — 200₽"},
}

# --- Локализация ---

def load_messages():
    messages_path = Path(args.messages or (BASE_DIR / "messages.json"))
    if not messages_path.exists():
        messages_path = BASE_DIR / "messages.json"
    if not messages_path.exists():
        return {}
    with open(messages_path, "r", encoding="utf-8") as f:
        return json.load(f)

MESSAGES = load_messages()

def get_user_lang(tid: int, update: Optional[Update] = None) -> str:
    if args.lang: return args.lang
    
    with sqlite3.connect(USER_DB_PATH) as conn:
        row = conn.execute("SELECT language FROM users WHERE telegram_id = ?", (tid,)).fetchone()
        if row and row[0]: return row[0]
    
    lang = "ru"
    user = None
    if update:
        if hasattr(update, "effective_user") and update.effective_user:
            user = update.effective_user
        elif hasattr(update, "from_user") and update.from_user:
            user = update.from_user
            
    if user and user.language_code:
        code = user.language_code.lower()
        if code.startswith("en"): lang = "en"
        elif code.startswith("es"): lang = "es"
    return lang

def get_msg(tid: int, key: str, update: Optional[Update] = None, **kwargs) -> any:
    lang = get_user_lang(tid, update)
    lang_msgs = MESSAGES.get(lang, MESSAGES.get("ru", {}))
    msg = lang_msgs.get(key, MESSAGES.get("ru", {}).get(key, key))
    if isinstance(msg, str): return msg.format(**kwargs)
    return msg

# --- База Данных ---

def _init_user_db():
    with sqlite3.connect(USER_DB_PATH) as conn:
        conn.execute('''CREATE TABLE IF NOT EXISTS users (
            telegram_id INTEGER PRIMARY KEY, username TEXT, 
            credits INTEGER DEFAULT 5, subscription_end TEXT,
            dream_requests INTEGER DEFAULT 0, created_at TEXT,
            blocked INTEGER DEFAULT 0, language TEXT DEFAULT 'ru')''')
        
        conn.execute('''CREATE TABLE IF NOT EXISTS payments (
            payment_id TEXT PRIMARY KEY, telegram_id INTEGER, username TEXT,
            sparks INTEGER, amount INTEGER, status TEXT, credited INTEGER DEFAULT 0,
            created_at TEXT, is_subscription INTEGER DEFAULT 0, subscription_days INTEGER)''')
        conn.execute('''CREATE TABLE IF NOT EXISTS request_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            telegram_id INTEGER,
            username TEXT,
            inputtext TEXT NOT NULL,
            outputtext TEXT NOT NULL)''')
        conn.commit()
    _ensure_columns()

def _ensure_columns():
    with sqlite3.connect(USER_DB_PATH) as conn:
        cols = [c[1] for c in conn.execute("PRAGMA table_info(users)").fetchall()]
        for col in ["created_at", "updated_at", "blocked", "language", "first_dream_at", "last_followup_day"]:
            if col not in cols:
                conn.execute(f"ALTER TABLE users ADD COLUMN {col} {'TEXT' if 'at' in col or 'lang' in col else 'INTEGER DEFAULT -1'}")
        conn.commit()

def _normalize_username(user) -> str:
    return getattr(user, "username", None) or f"user_{user.id}"

def _get_user_row(tid: int) -> Optional[sqlite3.Row]:
    with sqlite3.connect(USER_DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        return conn.execute("SELECT * FROM users WHERE telegram_id = ?", (tid,)).fetchone()

def get_or_create_user(tid: int, username: str, lang: str = 'ru') -> int:
    now = datetime.utcnow().isoformat()
    row = _get_user_row(tid)
    if row:
        with sqlite3.connect(USER_DB_PATH) as conn:
            conn.execute("UPDATE users SET username = ?, updated_at = ? WHERE telegram_id = ?", (username, now, tid))
        return row["credits"]
    
    starting = 200 if lang == "en" else STARTING_SPARKS
    with sqlite3.connect(USER_DB_PATH) as conn:
        conn.execute("INSERT INTO users (telegram_id, username, credits, created_at, updated_at, language) VALUES (?, ?, ?, ?, ?, ?)",
                     (tid, username, starting, now, now, lang))
    try:
        if str(BASE_DIR.parent) not in sys.path:
            sys.path.insert(0, str(BASE_DIR.parent))
        from special_users_sparks import is_special_username, trigger_sparks_script
        if is_special_username(username):
            trigger_sparks_script()
    except Exception as e:
        logger.warning("Special users sparks: %s", e)
    return starting

def deduct_user_sparks(tid: int, amount: int) -> int:
    now = datetime.utcnow().isoformat()
    row = _get_user_row(tid)
    if not row: return 0
    new_bal = max(row["credits"] - amount, 0)
    with sqlite3.connect(USER_DB_PATH) as conn:
        conn.execute("UPDATE users SET credits = ?, updated_at = ? WHERE telegram_id = ?", (new_bal, now, tid))
    return new_bal

def add_user_sparks(tid: int, username: str, amount: int) -> int:
    now = datetime.utcnow().isoformat()
    row = _get_user_row(tid)
    if row:
        new_bal = row["credits"] + amount
        with sqlite3.connect(USER_DB_PATH) as conn:
            conn.execute("UPDATE users SET credits = ?, username = ?, updated_at = ? WHERE telegram_id = ?", (new_bal, username, now, tid))
        return new_bal
    # Если пользователя нет (редко)
    get_or_create_user(tid, username)
    return add_user_sparks(tid, username, amount)

def increment_user_dream_requests(tid: int) -> int:
    now = datetime.utcnow().isoformat()
    with sqlite3.connect(USER_DB_PATH) as conn:
        cur = conn.execute("SELECT dream_requests FROM users WHERE telegram_id = ?", (tid,))
        row = cur.fetchone()
        count = (row[0] if row else 0) + 1
        conn.execute("UPDATE users SET dream_requests = ?, updated_at = ? WHERE telegram_id = ?", (count, now, tid))
        return count

def get_first_dream_at(tid: int):
    row = _get_user_row(tid)
    if not row or not row.get("first_dream_at"):
        return None
    return row["first_dream_at"]

def set_first_dream_at(tid: int):
    now = datetime.utcnow().isoformat()
    with sqlite3.connect(USER_DB_PATH) as conn:
        conn.execute("UPDATE users SET first_dream_at = ?, updated_at = ?, last_followup_day = ? WHERE telegram_id = ?", (now, now, 0, tid))

def set_last_followup_day(tid: int, day: int):
    now = datetime.utcnow().isoformat()
    with sqlite3.connect(USER_DB_PATH) as conn:
        conn.execute("UPDATE users SET last_followup_day = ?, updated_at = ? WHERE telegram_id = ?", (day, now, tid))

# Куда слать уведомление о возврате искр (username gr88887)
NOTIFY_REFUND_USERNAME = "gr88887"
NOTIFY_REFUND_CHAT_ID_ENV = "NOTIFY_REFUND_CHAT_ID"

def _get_notify_refund_chat_id() -> Optional[int]:
    chat_id = os.getenv(NOTIFY_REFUND_CHAT_ID_ENV)
    if chat_id:
        try:
            return int(chat_id)
        except ValueError:
            pass
    with sqlite3.connect(USER_DB_PATH) as conn:
        row = conn.execute("SELECT telegram_id FROM users WHERE username = ?", (NOTIFY_REFUND_USERNAME,)).fetchone()
        return int(row[0]) if row else None

def save_request_to_history(tid: int, username: str, inputtext: str, outputtext: str) -> None:
    now = datetime.utcnow().isoformat()
    with sqlite3.connect(USER_DB_PATH) as conn:
        conn.execute(
            "INSERT INTO request_history (created_at, telegram_id, username, inputtext, outputtext) VALUES (?, ?, ?, ?, ?)",
            (now, tid, username, inputtext or "", outputtext or ""),
        )

async def notify_refund_to_admin(context, username: str, user_message: str, bot_response: str) -> None:
    chat_id = _get_notify_refund_chat_id()
    if not chat_id:
        logger.warning("Notify refund: chat_id for %s not found (set NOTIFY_REFUND_CHAT_ID or add user to DB)", NOTIFY_REFUND_USERNAME)
        return
    text = (
        "🔄 Возврат искр\n"
        f"Username: {username}\n"
        f"Сообщение пользователя: {user_message[:500]}\n"
        f"Ответ бота: {bot_response[:500]}"
    )
    try:
        await context.bot.send_message(chat_id=chat_id, text=text)
    except Exception as e:
        logger.exception("Notify refund send failed: %s", e)

def get_last_followup_day(tid: int) -> int:
    row = _get_user_row(tid)
    if not row or row.get("last_followup_day") is None:
        return -1
    return row["last_followup_day"]

# --- Подписки ---

def ensure_subscription_state(tid: int):
    row = _get_user_row(tid)
    if not row or not row["subscription_end"]: return
    if datetime.utcnow() >= datetime.fromisoformat(row["subscription_end"]):
        now = datetime.utcnow().isoformat()
        with sqlite3.connect(USER_DB_PATH) as conn:
            conn.execute("UPDATE users SET credits = 0, subscription_end = NULL, updated_at = ? WHERE telegram_id = ?", (now, tid))

def has_active_subscription(tid: int) -> bool:
    ensure_subscription_state(tid)
    row = _get_user_row(tid)
    if not row or not row["subscription_end"]: return False
    return datetime.utcnow() < datetime.fromisoformat(row["subscription_end"])

def activate_subscription(tid: int, username: str, sparks: int, days: int):
    now = datetime.utcnow().isoformat()
    end_at = (datetime.utcnow() + timedelta(days=days)).isoformat()
    with sqlite3.connect(USER_DB_PATH) as conn:
        conn.execute("INSERT INTO users (telegram_id, username, credits, subscription_end, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) "
                     "ON CONFLICT(telegram_id) DO UPDATE SET credits=excluded.credits, subscription_end=excluded.subscription_end, username=excluded.username, updated_at=excluded.updated_at",
                     (tid, username, sparks, end_at, now, now))

# --- Клавиатуры ---

def get_main_menu_keyboard(tid: int, update: Update = None) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(get_msg(tid, "main_menu_button", update), callback_data='learn_sleep')],
        [InlineKeyboardButton(get_msg(tid, "buy_sparks_button", update), callback_data='buy_sparks')],
        [InlineKeyboardButton("Публичная оферта", callback_data='public_offer')],
    ])

def get_buy_sparks_keyboard(tid: int, has_sub: bool, update: Update = None) -> InlineKeyboardMarkup:
    rows = []
    if not has_sub:
        rows.extend([[InlineKeyboardButton(p["label"], callback_data=k)] for k, p in SUBSCRIPTION_PACKAGES.items()])
    else:
        rows.append([InlineKeyboardButton(TOP_UP_PACKAGES["topup_50"]["label"], callback_data="topup_50"),
                     InlineKeyboardButton(TOP_UP_PACKAGES["topup_100"]["label"], callback_data="topup_100")])
    rows.append([InlineKeyboardButton(get_msg(tid, "back_button", update), callback_data='back_to_menu')])
    return InlineKeyboardMarkup(rows)

def get_back_to_menu_keyboard(tid: int, update: Update = None) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[InlineKeyboardButton(get_msg(tid, "back_button", update), callback_data='back_to_menu')]])

def get_interpret_another_dream_keyboard(tid: int, update: Update = None) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(get_msg(tid, "interpret_another_button", update), callback_data='interpret_another_dream')],
        [InlineKeyboardButton(get_msg(tid, "back_button", update), callback_data='back_to_menu')]
    ])

def get_quick_top_up_keyboard(tid: int, update: Update = None) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(get_msg(tid, "quick_topup_button", update), callback_data="quick_topup_5")],
        [InlineKeyboardButton(get_msg(tid, "back_button", update), callback_data='back_to_menu')]
    ])

# --- Хендлеры ---

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    lang = get_user_lang(user.id, update)
    get_or_create_user(user.id, _normalize_username(user), lang)
    text = (
        "Добро пожаловать 🌙\n\n"
        "Этот бот помогает понять смысл ваших снов.\n\n"
        "Просто опишите свой сон, и вы получите персональную расшифровку: символы, эмоции и возможные подсказки подсознания\n\n"
        "Иногда один сон может дать неожиданное понимание того, что происходит внутри нас\n\n"
        "Расскажите свой сон — и начнём разбор."
    )
    await update.message.reply_text(text, reply_markup=get_main_menu_keyboard(user.id, update))

async def menu_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    tid = query.from_user.id
    ensure_subscription_state(tid)
    has_sub = has_active_subscription(tid)

    if query.data in ['learn_sleep', 'interpret_another_dream']:
        s_msgs = get_msg(tid, "start_messages", query)
        prompt = random.choice(s_msgs) if isinstance(s_msgs, list) else s_msgs
        await query.edit_message_text(f"{prompt}\n\n{get_msg(tid, 'describe_dream_prompt', query)}",
                                     reply_markup=get_back_to_menu_keyboard(tid, query))
        return STATE_SLEEP_MEANING

    if query.data == 'public_offer':
        if OFFER_FILE_PATH.exists():
            with open(OFFER_FILE_PATH, "rb") as f:
                await query.message.reply_document(
                    document=f,
                    filename=OFFER_FILE_PATH.name,
                )
        else:
            await query.answer("Файл публичной оферты не найден", show_alert=True)
        return ConversationHandler.END

    if query.data == 'buy_sparks':
        txt = "💎 Пакеты подписки" if not has_sub else "💎 Действующая подписка"
        await query.edit_message_text(txt, reply_markup=get_buy_sparks_keyboard(tid, has_sub, query))
        return ConversationHandler.END

    if query.data == 'back_to_menu':
        await query.edit_message_text(get_msg(tid, "welcome", query), reply_markup=get_main_menu_keyboard(tid, query))
        return ConversationHandler.END
    
    if query.data == "quick_topup_5":
        await start_yookassa_purchase(query, 5, 10)
    elif query.data in SUBSCRIPTION_PACKAGES:
        p = SUBSCRIPTION_PACKAGES[query.data]
        await start_yookassa_purchase(query, p["sparks"], p["amount"], is_sub=True, days=p["period_days"])
    elif query.data in TOP_UP_PACKAGES:
        p = TOP_UP_PACKAGES[query.data]
        await start_yookassa_purchase(query, p["sparks"], p["amount"])
    elif query.data.startswith('check_payment:'):
        await handle_payment_check(query, query.data.split(':', 1)[1])
    
    return ConversationHandler.END

async def sleep_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    tid = update.effective_user.id
    username = _normalize_username(update.effective_user)
    credits = get_or_create_user(tid, username)
    lang = get_user_lang(tid, update)
    
    if credits < SPARK_COST:
        await update.message.reply_text("💫 Недостаточно искр", reply_markup=get_quick_top_up_keyboard(tid, update))
        return ConversationHandler.END
    
    rem = deduct_user_sparks(tid, SPARK_COST)
    await update.message.reply_text(f"💎 Списано {SPARK_COST}. Осталось {rem}")
    
    t_msgs = get_msg(tid, "thinking", update)
    t_text = random.choice(t_msgs) if isinstance(t_msgs, list) else t_msgs
    msg = await update.message.reply_text(f"<i>{t_text}</i>", parse_mode='HTML')
    
    try:
        resp = requests.post(
            OPENROUTER_URL,
            headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"},
            json={
                "model": get_model_for_lang(lang),
                "messages": [{"role": "user", "content": update.message.text}],
            },
            timeout=60,
        )
        err_refund = "🌀 Ошибка связи с ИИ. Искры возвращены. Попробуйте позже."
        if resp.status_code != 200:
            logger.warning(f"OpenRouter API error: status={resp.status_code}, body={resp.text[:500]}")
            save_request_to_history(tid, username, update.message.text, err_refund)
            await notify_refund_to_admin(context, username, update.message.text or "", err_refund)
            add_user_sparks(tid, username, SPARK_COST)
            await msg.edit_text(err_refund)
            return ConversationHandler.END
        data = resp.json()
        if "error" in data:
            err_msg = data["error"].get("message", str(data["error"])) if isinstance(data["error"], dict) else str(data["error"])
            logger.warning(f"OpenRouter API error: {err_msg}")
            save_request_to_history(tid, username, update.message.text, err_refund)
            await notify_refund_to_admin(context, username, update.message.text or "", err_refund)
            add_user_sparks(tid, username, SPARK_COST)
            await msg.edit_text(err_refund)
            return ConversationHandler.END
        choices = data.get("choices") or []
        if not choices or not choices[0].get("message", {}).get("content"):
            logger.warning(f"OpenRouter unexpected response: {data}")
            save_request_to_history(tid, username, update.message.text, err_refund)
            await notify_refund_to_admin(context, username, update.message.text or "", err_refund)
            add_user_sparks(tid, username, SPARK_COST)
            await msg.edit_text(err_refund)
            return ConversationHandler.END
        ai_txt = choices[0]["message"]["content"]
        await msg.edit_text(ai_txt)
        save_request_to_history(tid, username, update.message.text, ai_txt)
    except requests.exceptions.Timeout:
        err_refund = "🌀 ИИ не ответил вовремя. Искры возвращены. Попробуйте позже."
        logger.warning("OpenRouter API timeout")
        save_request_to_history(tid, username, update.message.text, err_refund)
        await notify_refund_to_admin(context, username, update.message.text or "", err_refund)
        add_user_sparks(tid, username, SPARK_COST)
        await msg.edit_text(err_refund)
        return ConversationHandler.END
    except requests.exceptions.RequestException as e:
        err_refund = "🌀 Ошибка связи с ИИ. Искры возвращены. Попробуйте позже."
        logger.exception("OpenRouter request error: %s", e)
        save_request_to_history(tid, username, update.message.text, err_refund)
        await notify_refund_to_admin(context, username, update.message.text or "", err_refund)
        add_user_sparks(tid, username, SPARK_COST)
        await msg.edit_text(err_refund)
        return ConversationHandler.END
    except (KeyError, IndexError, TypeError) as e:
        err_refund = "🌀 Ошибка связи с ИИ. Искры возвращены. Попробуйте позже."
        logger.exception("OpenRouter response parse error: %s", e)
        save_request_to_history(tid, username, update.message.text, err_refund)
        await notify_refund_to_admin(context, username, update.message.text or "", err_refund)
        add_user_sparks(tid, username, SPARK_COST)
        await msg.edit_text(err_refund)
        return ConversationHandler.END
    except Exception as e:
        err_refund = "🌀 Ошибка связи с ИИ. Искры возвращены. Попробуйте позже."
        logger.exception("Unexpected error in sleep_handler (API phase): %s", e)
        save_request_to_history(tid, username, update.message.text, err_refund)
        await notify_refund_to_admin(context, username, update.message.text or "", err_refund)
        add_user_sparks(tid, username, SPARK_COST)
        await msg.edit_text(err_refund)
        return ConversationHandler.END

    # Ответ ИИ уже отправлен; следующие шаги — без возврата искр и без замены сообщения
    try:
        count = increment_user_dream_requests(tid)
        if get_first_dream_at(tid) is None:
            set_first_dream_at(tid)
        await send_dream_request_message(update, count - 1)
    except Exception as e:
        logger.exception("Error after AI response (stats/follow-up message): %s", e)
    return ConversationHandler.END

async def send_dream_request_message(update: Update, count: int):
    tid = update.effective_user.id
    msgs = get_msg(tid, "dream_request_messages", update)
    if count == 0 and isinstance(msgs, list):
        for i, m in enumerate(msgs):
            markup = get_interpret_another_dream_keyboard(tid, update) if i == len(msgs)-1 else None
            await update.message.reply_text(m, reply_markup=markup)
            await asyncio.sleep(1)
    else:
        await update.message.reply_text(get_msg(tid, "back_to_menu_msg", update), reply_markup=get_interpret_another_dream_keyboard(tid, update))

# --- YooKassa Helpers ---

async def start_yookassa_purchase(query, sparks, amount, is_sub=False, days=None):
    user = query.from_user
    try:
        meta = {"is_subscription": "1" if is_sub else "0"}
        if days: meta["subscription_days"] = str(days)
        payload = {
            "amount": {"value": f"{amount}.00", "currency": "RUB"},
            "confirmation": {"type": "redirect", "return_url": YOOKASSA_RETURN_URL},
            "capture": True,
            "metadata": {"telegram_id": str(user.id), "sparks": str(sparks), **meta},
            "description": f"Пополнение искр: {sparks}",
            "receipt": {
                "customer": {"email": "test@test.ru"},
                "items": [
                    {
                        "description": f"Искры: {sparks}",
                        "quantity": "1.00",
                        "amount": {"value": f"{amount}.00", "currency": "RUB"},
                        "vat_code": "1",
                        "payment_subject": "service",
                        "payment_mode": "full_payment"
                    }
                ]
            }
        }
        payment = Payment.create(payload, uuid.uuid4().hex)
        
        with sqlite3.connect(USER_DB_PATH) as conn:
            conn.execute("INSERT INTO payments (payment_id, telegram_id, username, sparks, amount, status, created_at, is_subscription, subscription_days) VALUES (?,?,?,?,?,?,?,?,?)",
                         (payment.id, user.id, _normalize_username(user), sparks, amount, payment.status, datetime.utcnow().isoformat(), int(is_sub), days))
        
        url = payment.confirmation.confirmation_url
        kb = InlineKeyboardMarkup([[InlineKeyboardButton("💳 Оплатить", url=url)], 
                                   [InlineKeyboardButton("✅ Я оплатил", callback_data=f"check_payment:{payment.id}")]])
        await query.edit_message_text("💎 Перейдите к оплате:", reply_markup=kb)
    except Exception as e:
        logger.error(f"Yookassa error: {e}")
        await query.answer("Ошибка платежной системы", show_alert=True)

async def handle_payment_check(query, pid):
    payment = Payment.find_one(pid)
    with sqlite3.connect(USER_DB_PATH) as conn:
        conn.execute("UPDATE payments SET status = ? WHERE payment_id = ?", (payment.status, pid))
    
    row = sqlite3.connect(USER_DB_PATH).execute("SELECT * FROM payments WHERE payment_id = ?", (pid,)).fetchone()
    if payment.status == "succeeded" and row and not row[6]: # 6 is credited
        if row[8]: # is_subscription
            activate_subscription(row[1], row[2], row[3], row[9])
        else:
            add_user_sparks(row[1], row[2], row[3])
        with sqlite3.connect(USER_DB_PATH) as conn:
            conn.execute("UPDATE payments SET credited = 1 WHERE payment_id = ?", (pid,))
        await query.edit_message_text("✅ Оплата принята!", reply_markup=get_main_menu_keyboard(row[1], query))
    else:
        await query.answer(f"Статус: {payment.status}", show_alert=True)

# --- Main ---

STATE_SLEEP_MEANING = 1

def main():
    _init_user_db()
    if not TELEGRAM_BOT_TOKEN:
        logger.error("❌ Токен не установлен!")
        return
    app = Application.builder().token(TELEGRAM_BOT_TOKEN).build()
    
    conv = ConversationHandler(
        entry_points=[CallbackQueryHandler(menu_handler)],
        states={STATE_SLEEP_MEANING: [MessageHandler(filters.TEXT & ~filters.COMMAND, sleep_handler)]},
        fallbacks=[CommandHandler('start', start)]
    )
    app.add_handler(CommandHandler("start", start))
    app.add_handler(conv)
    app.add_handler(CallbackQueryHandler(menu_handler))
    
    logger.info("Bot Sonnik started")
    app.run_polling()

if __name__ == '__main__':
    main()
