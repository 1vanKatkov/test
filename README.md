# FastAPI mini app + Telegram/MAX bots

Simple project with:
- FastAPI mini app (`/mini-app`) that shows user name and social platform in the center.
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

Optional toggles:
- `RUN_TELEGRAM_BOT=true|false`
- `RUN_MAX_BOT=true|false`

## 3) One command run (web + bots)

```bash
python run_all.py
```

Healthcheck and local test:
- `http://127.0.0.1:8000/health`
- `http://127.0.0.1:8000/mini-app?platform=telegram&name=Ivan`

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

`PORT` is supported automatically (most hostings set it). If missing, app uses `APP_PORT` or `8000`.

## Notes

- Telegram mini app user data is read from `window.Telegram.WebApp.initDataUnsafe.user` when available.
- MAX mini app fallback uses URL query parameters (`name`, `platform`).
- MAX implementation in `bots/max_bot.py` expects Telegram-style bot endpoints (`getUpdates`, `sendMessage`) under `MAX_API_BASE_URL`.
- If you need only web server in one instance, set `RUN_TELEGRAM_BOT=false` and `RUN_MAX_BOT=false`.
