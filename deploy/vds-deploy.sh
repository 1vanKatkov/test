#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
SERVICE_NAME="${SERVICE_NAME:-miniapp}"

cd "$APP_DIR"

echo "==> App dir: $APP_DIR"
echo "==> Git pull"
git pull origin master

if ! grep -q 'api/auth/email/health' app/server.py; then
  echo "ERROR: app/server.py has no email auth routes. Wrong directory or old checkout?"
  exit 1
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
sudo systemctl restart "$SERVICE_NAME"
sleep 3
sudo systemctl is-active --quiet "$SERVICE_NAME"

echo "==> Health checks (localhost:8000)"
curl -fsS http://127.0.0.1:8000/health | tee /tmp/astrolhub-health.json
echo
curl -fsS http://127.0.0.1:8000/api/auth/email/health
echo
echo "==> Done. build must be f3aa0cd-auth-static-v1 or newer."
