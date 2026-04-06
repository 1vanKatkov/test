# Max Bot (Webhook)

Минимальный бот для социальной сети Max:
- приветствие;
- одна кнопка открытия веб-приложения (`MAX_WEB_APP_URL`).

## Структура

- `main.py` — FastAPI webhook (`/webhook/max`) и healthcheck (`/health`)
- `config.py` — переменные окружения
- `max_api.py` — адаптер запросов в API Max
- `handlers.py` — обработка события старта

## Переменные окружения

Создайте файл `.env` в папке `max_bot`:

```env
HOST=0.0.0.0
PORT=8020

MAX_BOT_TOKEN=your_bot_token
MAX_BOT_WEBHOOK_SECRET=your_webhook_secret
MAX_WEB_APP_URL=https://your-domain/max-web-app
MAX_API_BASE_URL=https://api.max.example
MAX_SEND_MESSAGE_PATH=/bot/sendMessage
```

## Запуск локально

```bash
cd C:/Users/Ivan/Desktop/Max/bots228/max_bot
python -m pip install -r requirements.txt
python main.py
```

Проверка:

```bash
curl http://localhost:8020/health
```

## Пример webhook-запроса

```bash
curl -X POST http://localhost:8020/webhook/max \
  -H "Content-Type: application/json" \
  -H "X-Max-Webhook-Secret: your_webhook_secret" \
  -d "{\"type\":\"start\",\"chat_id\":\"12345\"}"
```

## Подключение в Max

1. Задеплойте сервис в интернет по HTTPS.
2. Установите webhook в кабинете/CLI Max: `https://your-domain/webhook/max`.
3. Убедитесь, что Max отправляет заголовок `X-Max-Webhook-Secret` (или отключите проверку, оставив пустым `MAX_BOT_WEBHOOK_SECRET`).
4. Проверьте стартовый сценарий: пользователь пишет боту, бот отправляет приветствие и кнопку на `MAX_WEB_APP_URL`.

## Адаптация под документацию Max

Если в вашей документации Max отличаются payload или метод отправки сообщений:
- обновите маппинг в `handlers.py` (`_extract_chat_id`, `_is_start_event`);
- обновите endpoint/формат в `max_api.py` (`send_message`).
