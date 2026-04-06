# Max Web App

Отдельное FastAPI-приложение с модулями:
- sonnik
- numerology
- sovmestimost
- tarot

## Запуск

```bash
pip install -r requirements.txt
python main.py
```

По умолчанию приложение доступно на `http://localhost:8010`.

## Переменные окружения

```env
OPENROUTER_API_KEY=your_openrouter_key
MAX_AUTH_SECRET=your_max_signing_secret
DATABASE_PATH=./data/max_web_app.db
PORT=8010
```

## Авторизация Max

API ожидает заголовки:
- `X-Max-User-Id`
- `X-Max-Timestamp`
- `X-Max-Nonce`
- `X-Max-Signature`
- `X-Max-Username` (опционально)
- `X-Max-Language` (опционально)

Сигнатура:
- `hex(hmac_sha256(MAX_AUTH_SECRET, "{user_id}:{timestamp}:{nonce}:{sha256(body)}"))`
