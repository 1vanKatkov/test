# VDS deploy (vdsina / systemd)

## Quick deploy

```bash
cd /root/opt/test/test
chmod +x deploy/vds-deploy.sh
EMAIL_SKIP_VERIFICATION=true ./deploy/vds-deploy.sh
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

`/health` must include `build` (not only `{"status":"ok"}`):

```json
{"status":"ok","build":"f3aa0cd-auth-static-v1","email_auth":true,"email_skip_verification":true}
```

`/api/auth/email/health` must return **200**, not `{"detail":"Not Found"}`.

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

## `.env` on server

```env
EMAIL_SKIP_VERIFICATION=true
RUN_TELEGRAM_BOT=false
```

Restart after any `.env` change.
