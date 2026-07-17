# VDS deploy (vdsina / systemd)

## Quick deploy

```bash
cd /root/opt/test/test
chmod +x deploy/vds-deploy.sh
./deploy/vds-deploy.sh
```

Or manually:

```bash
cd /root/opt/test/test
git pull origin master
sudo systemctl restart miniapp
sleep 3
curl -s http://127.0.0.1:8000/health
curl -s http://127.0.0.1:8000/api/auth/email/health
```

## Expected responses

`/health` must include `build` (not only `{"status":"ok"}`).

`/api/auth/email/health` must return **200** with email verification enabled:

```json
{
  "smtp_configured": true,
  "email_skip_verification": false,
  "smtp_host_set": true,
  "smtp_from_set": true,
  "smtp_user_set": true
}
```

If `email_skip_verification` is `true`, registration skips the email code.
If `smtp_configured` is `false`, start/resend will return **503**.

## Email verification `.env` on server

Set these in `/root/opt/test/test/.env` (do not commit secrets):

```env
EMAIL_SKIP_VERIFICATION=false
EMAIL_AUTH_SECRET=<long-random-secret>
EMAIL_AUTH_TTL_SECONDS=2592000
EMAIL_CODE_TTL_SECONDS=600
EMAIL_CODE_MAX_ATTEMPTS=5
EMAIL_CODE_RESEND_COOLDOWN_SECONDS=60

# Example: Gmail / Google Workspace with App Password (port 587 + STARTTLS)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USE_TLS=true
SMTP_USE_SSL=false
SMTP_USER=your-mailbox@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=your-mailbox@gmail.com

# Example: port 465 (implicit SSL)
# SMTP_PORT=465
# SMTP_USE_TLS=false
# SMTP_USE_SSL=true
```

After editing `.env`:

```bash
sudo systemctl restart miniapp
curl -s http://127.0.0.1:8000/api/auth/email/health
```

Also keep:

```env
RUN_TELEGRAM_BOT=false
```

if bots are not run on this host.

## If you still get Not Found

1. Check that code on disk is current:

```bash
grep -n api/auth/email/health app/server.py
git log -1 --oneline
```

2. Check which process listens on port 8000:

```bash
ss -tlnp | grep 8000
sudo systemctl cat miniapp
```

`ExecStart` must be:

```text
/root/opt/test/test/.venv/bin/python run_all.py
```

`WorkingDirectory=/root/opt/test/test`

3. Compare systemd unit with `deploy/miniapp.service.example`.

4. Kill stale process if port is held by old uvicorn:

```bash
sudo systemctl stop miniapp
fuser -k 8000/tcp || true
sudo systemctl start miniapp
```
