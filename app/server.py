from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Query, Request
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates

from config import settings


BASE_DIR = Path(__file__).resolve().parent
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

app = FastAPI(title=settings.app_title)


@app.get("/", include_in_schema=False)
async def root() -> RedirectResponse:
    return RedirectResponse(url="/mini-app")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/mini-app")
async def mini_app(
    request: Request,
    name: str = Query(default="Unknown user"),
    platform: str = Query(default="unknown"),
):
    safe_platform = platform.lower().strip() or "unknown"
    safe_name = name.strip() or "Unknown user"
    return templates.TemplateResponse(
        request=request,
        name="mini_app.html",
        context={
            "name": safe_name,
            "platform": safe_platform,
        },
    )
