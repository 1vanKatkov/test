import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from config import HOST, MAX_BOT_WEBHOOK_SECRET, PORT
from handlers import handle_update
from max_api import MaxApiClient


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("max_bot service started")
    yield
    logger.info("max_bot service stopped")


app = FastAPI(title="max-bot-webhook", lifespan=lifespan)
max_api_client = MaxApiClient()


def _check_webhook_secret(header_value: str | None) -> None:
    if not MAX_BOT_WEBHOOK_SECRET:
        return
    if not header_value or header_value != MAX_BOT_WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="Invalid webhook secret")


@app.get("/health")
async def health():
    return {"ok": True, "service": "max_bot"}


@app.post("/webhook/max")
async def webhook_max(
    request: Request,
    x_max_webhook_secret: str | None = Header(default=None, alias="X-Max-Webhook-Secret"),
):
    _check_webhook_secret(x_max_webhook_secret)
    update = await request.json()

    try:
        result = handle_update(update, max_api_client)
        return JSONResponse(result)
    except RuntimeError as exc:
        logger.error("failed to process update: %s", exc)
        return JSONResponse(status_code=502, content={"ok": False, "error": str(exc)})
    except Exception as exc:  # defensive fallback
        logger.exception("unexpected webhook error: %s", exc)
        return JSONResponse(status_code=500, content={"ok": False, "error": "unexpected_error"})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT)
