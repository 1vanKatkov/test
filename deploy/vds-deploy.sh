#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
SERVICE_NAME="${SERVICE_NAME:-}"
if [[ -z "$SERVICE_NAME" ]]; then
  if systemctl list-unit-files astrolhub.service >/dev/null 2>&1 && systemctl cat astrolhub.service >/dev/null 2>&1; then
    SERVICE_NAME="astrolhub"
  else
    SERVICE_NAME="miniapp"
  fi
fi

cd "$APP_DIR"

echo "==> App dir: $APP_DIR"
echo "==> Git pull"
git pull origin master

if ! grep -q 'api/auth/email/health' app/server.py; then
  echo "ERROR: app/server.py has no email auth routes. Wrong directory or old checkout?"
  exit 1
fi

if [[ -f .env ]]; then
  echo "==> Ensure classic email verification is enabled when real SMTP is configured"
  SMTP_HOST_VAL="$(grep -E '^SMTP_HOST=' .env | tail -n1 | cut -d= -f2- || true)"
  SMTP_FROM_VAL="$(grep -E '^SMTP_FROM=' .env | tail -n1 | cut -d= -f2- || true)"
  SMTP_USER_VAL="$(grep -E '^SMTP_USER=' .env | tail -n1 | cut -d= -f2- || true)"
  SMTP_PASS_VAL="$(grep -E '^SMTP_PASSWORD=' .env | tail -n1 | cut -d= -f2- || true)"
  if [[ -n "$SMTP_HOST_VAL" && -n "$SMTP_FROM_VAL" \
    && "$SMTP_HOST_VAL" != *example.com* \
    && "$SMTP_FROM_VAL" != *example* \
    && "$SMTP_USER_VAL" != your-smtp-user \
    && -n "$SMTP_PASS_VAL" ]]; then
    if grep -qE '^EMAIL_SKIP_VERIFICATION=' .env; then
      sed -i 's/^EMAIL_SKIP_VERIFICATION=.*/EMAIL_SKIP_VERIFICATION=false/' .env
    else
      printf '\nEMAIL_SKIP_VERIFICATION=false\n' >> .env
    fi
  else
    echo "==> SMTP looks incomplete/placeholder; leaving EMAIL_SKIP_VERIFICATION unchanged"
  fi
  if ! grep -qE '^EMAIL_AUTH_SECRET=.+' .env \
    || grep -qE '^EMAIL_AUTH_SECRET=(replace-with-long-random-secret|change-me-email-auth-secret)?$' .env; then
    SECRET="$(python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(48))
PY
)"
    if grep -qE '^EMAIL_AUTH_SECRET=' .env; then
      sed -i "s|^EMAIL_AUTH_SECRET=.*|EMAIL_AUTH_SECRET=${SECRET}|" .env
    else
      printf '\nEMAIL_AUTH_SECRET=%s\n' "$SECRET" >> .env
    fi
    echo "==> Generated EMAIL_AUTH_SECRET in .env"
  fi
fi

if [[ -x .venv/bin/python ]]; then
  PYTHON=".venv/bin/python"
  PIP=".venv/bin/pip"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON="python3"
  PIP="pip3"
else
  PYTHON="python"
  PIP="pip"
fi

echo "==> Install Python dependencies"
"$PIP" install -r requirements.txt

echo "==> Restart systemd service: $SERVICE_NAME"
# Prefer run_all.py so Telegram bot starts with the API process.
if [[ -f deploy/astrolhub.service.example ]] && [[ "$SERVICE_NAME" == "astrolhub" ]]; then
  if ! grep -q 'run_all.py' /etc/systemd/system/astrolhub.service 2>/dev/null; then
    echo "==> Updating astrolhub.service to run_all.py (API + Telegram bot)"
    cp deploy/astrolhub.service.example /etc/systemd/system/astrolhub.service
    sudo systemctl daemon-reload
  fi
fi
sudo systemctl restart "$SERVICE_NAME"
sleep 3
sudo systemctl is-active --quiet "$SERVICE_NAME"

echo "==> Health checks (localhost:8000)"
curl -fsS http://127.0.0.1:8000/health | tee /tmp/astrolhub-health.json
echo
curl -fsS http://127.0.0.1:8000/api/auth/email/health
echo
echo "==> Done. Expect email_skip_verification=false and smtp_configured=true for classic OTP."
