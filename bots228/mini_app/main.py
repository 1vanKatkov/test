import os
import random
import requests
import logging
import json
import re
from datetime import datetime, date
from pathlib import Path
from typing import Optional
import asyncpg
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv

# Импорты для нумерологии
import sys
numerology_path = Path(__file__).resolve().parent.parent / "numerology"
sys.path.insert(0, str(numerology_path))

from report_generator import (
    calculate_action_number,
    calculate_character_number,
    calculate_consciousness_number,
    calculate_destiny_number,
    calculate_energy_number,
    generate_numerology_report_pdf,
)

# Пути
BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
STATIC_DIR = BASE_DIR / "static"
TEMPLATES_DIR = BASE_DIR / "templates"

# Создаем директории
STATIC_DIR.mkdir(exist_ok=True)
TEMPLATES_DIR.mkdir(exist_ok=True)

load_dotenv()

# Настройки PostgreSQL
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://user:password@localhost:5432/mini_app_db"
)

# Настройки
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "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")
MODEL_SONNIK = "@preset/sonnik"

STARTING_SPARKS = 5
SPARK_COST = 5

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Глобальный пул соединений PostgreSQL
db_pool: Optional[asyncpg.Pool] = None

async def get_db_pool() -> asyncpg.Pool:
    """Получить пул соединений с БД"""
    global db_pool
    if db_pool is None:
        db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    return db_pool

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Управление жизненным циклом приложения"""
    # Инициализация при запуске
    pool = await get_db_pool()
    await init_db(pool)
    yield
    # Закрытие при остановке
    if db_pool:
        await db_pool.close()

app = FastAPI(title="Telegram Mini App", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

# Инициализация БД
async def init_db(pool: asyncpg.Pool):
    """Создание таблиц в PostgreSQL"""
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                telegram_id BIGINT PRIMARY KEY,
                username VARCHAR(255),
                credits INTEGER DEFAULT 5,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                language VARCHAR(10) DEFAULT 'ru'
            )
        """)

async def get_or_create_user(telegram_id: int, username: str = None) -> int:
    """Получить или создать пользователя"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT credits FROM users WHERE telegram_id = $1",
            telegram_id
        )
        if row:
            return row['credits']
        
        await conn.execute(
            "INSERT INTO users (telegram_id, username, credits, created_at) VALUES ($1, $2, $3, $4)",
            telegram_id,
            username or f"user_{telegram_id}",
            STARTING_SPARKS,
            datetime.utcnow()
        )
        return STARTING_SPARKS

async def deduct_sparks(telegram_id: int, amount: int) -> int:
    """Списать искры у пользователя"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT credits FROM users WHERE telegram_id = $1",
            telegram_id
        )
        if not row:
            return 0
        
        new_balance = max(row['credits'] - amount, 0)
        await conn.execute(
            "UPDATE users SET credits = $1 WHERE telegram_id = $2",
            new_balance,
            telegram_id
        )
        return new_balance

async def get_user_balance(telegram_id: int) -> int:
    """Получить баланс пользователя"""
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT credits FROM users WHERE telegram_id = $1",
            telegram_id
        )
        return row['credits'] if row else STARTING_SPARKS

# Роуты
@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/numerology", response_class=HTMLResponse)
async def numerology_page(request: Request):
    return templates.TemplateResponse("numerology.html", {"request": request})

@app.get("/sonnik", response_class=HTMLResponse)
async def sonnik_page(request: Request):
    return templates.TemplateResponse("sonnik.html", {"request": request})

@app.post("/api/balance")
async def get_balance(telegram_id: int = Form(...)):
    balance = await get_user_balance(telegram_id)
    return JSONResponse({"balance": balance})

@app.post("/api/numerology/generate")
async def generate_numerology_report(
    telegram_id: int = Form(...),
    full_name: str = Form(...),
    birth_date: str = Form(...)
):
    try:
        # Проверка баланса
        balance = await get_user_balance(telegram_id)
        if balance < SPARK_COST:
            return JSONResponse(
                {"error": "Недостаточно искр", "balance": balance},
                status_code=400
            )
        
        # Парсинг даты
        try:
            birth_date_obj = datetime.strptime(birth_date, "%d.%m.%Y").date()
        except ValueError:
            return JSONResponse({"error": "Неверный формат даты. Используйте ДД.ММ.ГГГГ"}, status_code=400)
        
        # Списываем искры
        new_balance = await deduct_sparks(telegram_id, SPARK_COST)
        
        # Генерируем отчет
        pdf_path = generate_numerology_report_pdf(telegram_id, full_name, birth_date_obj)
        
        return JSONResponse({
            "success": True,
            "pdf_url": f"/api/download/{pdf_path.name}",
            "balance": new_balance
        })
    except Exception as e:
        logger.error(f"Error generating numerology report: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

@app.post("/api/sonnik/interpret")
async def interpret_dream(
    telegram_id: int = Form(...),
    dream_text: str = Form(...)
):
    try:
        # Проверка баланса
        balance = await get_user_balance(telegram_id)
        if balance < SPARK_COST:
            return JSONResponse(
                {"error": "Недостаточно искр", "balance": balance},
                status_code=400
            )
        
        # Списываем искры
        new_balance = await deduct_sparks(telegram_id, SPARK_COST)
        
        # Отправляем запрос в OpenRouter
        thinking_messages = [
            "🌙 Прислушиваюсь к шепоту вашего сна...",
            "✨ Читаю лунные письма вашей души...",
            "🕯️ Вглядываюсь в узоры ночного видения...",
            "🌌 Слежу за нитями сновидения...",
            "🌀 Расшифровываю символы подсознания...",
        ]
        
        thinking_message = random.choice(thinking_messages)
        
        try:
            response = requests.post(
                OPENROUTER_URL,
                headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}"},
                json={
                    "model": MODEL_SONNIK,
                    "messages": [{"role": "user", "content": dream_text}]
                },
                timeout=30
            )
            response.raise_for_status()
            result = response.json()
            interpretation = result['choices'][0]['message']['content']
        except Exception as e:
            logger.error(f"OpenRouter API error: {e}")
            interpretation = "🌀 Ошибка связи с ИИ. Попробуйте позже."
        
        return JSONResponse({
            "success": True,
            "interpretation": interpretation,
            "thinking": thinking_message,
            "balance": new_balance
        })
    except Exception as e:
        logger.error(f"Error interpreting dream: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/api/download/{filename}")
async def download_file(filename: str):
    # Проверяем несколько возможных путей
    possible_paths = [
        ROOT_DIR / "numerology" / "reports" / filename,
        BASE_DIR / "reports" / filename,
    ]
    
    for file_path in possible_paths:
        if file_path.exists():
            return FileResponse(file_path, media_type="application/pdf", filename=filename)
    
    raise HTTPException(status_code=404, detail="File not found")

if __name__ == "__main__":
    import uvicorn
    # Amvera использует порт из переменной окружения PORT или 8080 по умолчанию
    port = int(os.getenv("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
