# FastAPI mini app + Telegram/MAX bots + Web services

Project includes:
- FastAPI mini app at `/mini-app` (Telegram/MAX user info preview).
- Full web interface at `/` for:
  - Sonnik (dream interpretation),
  - Numerology (PDF report generation),
  - Sovmestimost (compatibility by names and by names+dates).
- API endpoints for web services under `/api/*` with MAX signature auth and balance charging/refund.
- Telegram bot with one `WebApp` button.
- MAX bot with one button opening the same mini app URL.
- Single launcher script `run_all.py` that starts web server + both bots together.

## 1) Install (Windows PowerShell)

```bash
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## 2) Configure env

1. Copy `.env.example` to `.env`
2. Fill required values:
   - `APP_BASE_URL` (public HTTPS domain of your deployed app)
   - `TELEGRAM_BOT_TOKEN`
   - `MAX_BOT_TOKEN`
   - `MAX_API_BASE_URL` (your MAX bot API base URL)
   - `OPENROUTER_API_KEY` (for sonnik/sovmestimost AI requests)
   - `MAX_AUTH_SECRET` (secret for MAX request signature verification)

Optional toggles:
- `RUN_TELEGRAM_BOT=true|false`
- `RUN_MAX_BOT=true|false`

Dev auth bypass (for testing authorized flows without real auth):
- `DEV_AUTH_BYPASS=true|false`
- `DEV_AUTH_MOCK_PROVIDER_USER_ID=dev-bypass-user`
- `DEV_AUTH_MOCK_USERNAME=Dev Tester`
- `DEV_AUTH_MOCK_LANGUAGE=ru`
- Keep `DEV_AUTH_BYPASS=false` in production.

## 3) One command run (web + bots)

```bash
python run_all.py
```

Healthcheck and local test:
- `http://127.0.0.1:8000/health`
- `http://127.0.0.1:8000/mini-app?platform=telegram&name=Ivan`
- `http://127.0.0.1:8000/` (web interface)

## Web services API

Available endpoints:
- `POST /api/auth/max/verify`
- `GET /api/profile`
- `GET /api/balance`
- `POST /api/sonnik/interpret`
- `POST /api/numerology/generate`
- `GET /api/reports/{file_name}`
- `POST /api/sovmestimost/by-names`
- `POST /api/sovmestimost/by-names-dates`

Important env vars for web services:
- `OPENROUTER_API_KEY`
- `OPENROUTER_URL`
- `MODEL_SONNIK`
- `MODEL_SOVMESTIMOST`
- `MAX_AUTH_SECRET`
- `DATABASE_PATH`
- `STARTING_CREDITS`, `COST_SONNIK`, `COST_NUMEROLOGY`, `COST_SOVMESTIMOST`
- Optional path overrides:
  - `NUMEROLOGY_DIR` (defaults to `./bots228/numerology`)
  - `SOVMESTIMOST_MESSAGES_PATH` (defaults to `./bots228/sovmestimost/messages.json`)
  - `REPORTS_DIR` (defaults to `./app/reports`)

## Dev Auth Bypass mode

Use this mode to test API/UI as an authorized user without real MAX/Telegram signatures.

Enable in `.env`:
```env
DEV_AUTH_BYPASS=true
DEV_AUTH_MOCK_PROVIDER_USER_ID=dev-bypass-user
DEV_AUTH_MOCK_USERNAME=Dev Tester
DEV_AUTH_MOCK_LANGUAGE=ru
```

Behavior when enabled:
- `/` treats user as recognized in landing logic.
- `/api/profile` returns mock authorized identity.
- Protected API endpoints (`/api/balance`, `/api/sonnik/interpret`, `/api/numerology/generate`, `/api/sovmestimost/*`) work without auth headers.

Security note:
- Never keep `DEV_AUTH_BYPASS=true` on public production.

## 4) Deploy on hosting

The app is prepared for common hostings in two formats:

- **Procfile mode**: start command is
  - `python run_all.py`
- **Docker mode**: project contains `Dockerfile` and `.dockerignore`

### Required env vars on hosting

- `APP_BASE_URL=https://your-domain.tld`
- `TELEGRAM_BOT_TOKEN=...`
- `MAX_BOT_TOKEN=...`
- `MAX_API_BASE_URL=...`
- `OPENROUTER_API_KEY=...`
- `MAX_AUTH_SECRET=...`

`PORT` is supported automatically (most hostings set it). If missing, app uses `APP_PORT` or `8000`.

## AI/OpenRouter troubleshooting

If AI endpoints fail, check these first:
- `OPENROUTER_API_KEY` is set and active.
- `OPENROUTER_URL` is `https://openrouter.ai/api/v1/chat/completions`.
- `MODEL_SONNIK` and `MODEL_SOVMESTIMOST` are valid for your OpenRouter account.

Typical API errors and meaning:
- `OPENROUTER_API_KEY is not configured` -> key is missing in `.env`.
- `AI provider status 401/403` -> key is invalid or access denied.
- `AI provider status 429` -> rate limit or quota exhausted.
- `AI provider returned no choices` -> provider returned unexpected payload.

Quick local check:
```bash
curl -X POST http://127.0.0.1:8000/api/sonnik/interpret \
  -H "Content-Type: application/json" \
  -d "{\"dream_text\":\"Приснился океан и птицы\"}"
```

## Notes

- Telegram mini app user data is read from `window.Telegram.WebApp.initDataUnsafe.user` when available.
- MAX mini app fallback uses URL query parameters (`name`, `platform`).
- MAX implementation in `bots/max_bot.py` expects Telegram-style bot endpoints (`getUpdates`, `sendMessage`) under `MAX_API_BASE_URL`.
- If you need only web server in one instance, set `RUN_TELEGRAM_BOT=false` and `RUN_MAX_BOT=false`.
- Web features require files from `bots228` (`numerology` report generator and `sovmestimost/messages.json`).
