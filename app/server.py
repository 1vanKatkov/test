from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Query, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.web.auth.max_auth import MaxIdentity, optional_max_auth, require_max_auth
from app.web.db import db
from app.web.schemas import (
    NumerologyRequest,
    SonnikRequest,
    SovmestimostNamesDatesRequest,
    SovmestimostNamesRequest,
)
from app.web.services import compatibility, numerology, sonnik
from app.web.services.balance import charge, get_balance, refund
from config import settings


BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init()
    yield


app = FastAPI(title=settings.app_title, lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


def _public_user_id() -> int:
    user = db.get_or_create_user(
        provider="public",
        provider_user_id="public-web",
        username="public_web",
        language="ru",
    )
    return int(user["id"])


def _resolve_runtime_user(identity: MaxIdentity | None) -> tuple[int, str, bool]:
    if identity:
        return identity.internal_user_id, identity.language, False
    return _public_user_id(), "ru", True


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def root(
    request: Request,
    name: str = Query(default=""),
    platform: str = Query(default=""),
):
    initial_name = name.strip()
    initial_platform = platform.strip().lower()
    recognized_from_query = bool(initial_name or initial_platform)
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "telegram_bot_url": "https://t.me/your_telegram_bot",
            "max_bot_url": "https://max.ru/your_max_bot",
            "brand_name": "Astrolhub",
            "initial_name": initial_name,
            "initial_platform": initial_platform,
            "recognized_from_query": recognized_from_query,
        },
    )


@app.get("/app", response_class=HTMLResponse, include_in_schema=False)
async def web_app_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="web_app.html",
        context={"brand_name": "Astrolhub"},
    )


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


@app.post("/api/auth/max/verify")
async def verify_auth(identity: MaxIdentity = Depends(require_max_auth)):
    return {
        "success": True,
        "profile": {
            "provider": "max",
            "provider_user_id": identity.user_id,
            "username": identity.username,
            "language": identity.language,
        },
        "balance": get_balance(identity.internal_user_id),
    }


@app.get("/api/profile")
async def profile(identity: MaxIdentity | None = Depends(optional_max_auth)):
    if not identity:
        return {
            "provider": "guest",
            "provider_user_id": "public-web",
            "username": "Guest",
            "language": "ru",
        }
    return {
        "provider": "max",
        "provider_user_id": identity.user_id,
        "username": identity.username,
        "language": identity.language,
    }


@app.get("/api/balance")
async def balance(identity: MaxIdentity | None = Depends(optional_max_auth)):
    if not identity:
        return {"balance": "Unlimited"}
    return {"balance": get_balance(identity.internal_user_id)}


@app.post("/api/sonnik/interpret")
async def api_sonnik(payload: SonnikRequest, identity: MaxIdentity | None = Depends(optional_max_auth)):
    user_id, _language, is_guest = _resolve_runtime_user(identity)
    if not is_guest:
        charge(user_id, settings.cost_sonnik, "sonnik", {"module": "sonnik"})
    try:
        interpretation = sonnik.interpret_dream(payload.dream_text)
    except Exception:
        if is_guest:
            new_balance = "Unlimited"
        else:
            new_balance = refund(user_id, settings.cost_sonnik, "sonnik_refund", {"module": "sonnik"})
        return JSONResponse(status_code=502, content={"error": "AI service is unavailable", "balance": new_balance})

    db.record_history(user_id, "sonnik", payload.dream_text, interpretation)
    balance_value = "Unlimited" if is_guest else get_balance(user_id)
    return {"success": True, "interpretation": interpretation, "balance": balance_value}


@app.post("/api/numerology/generate")
async def api_numerology(payload: NumerologyRequest, identity: MaxIdentity | None = Depends(optional_max_auth)):
    user_id, _language, is_guest = _resolve_runtime_user(identity)
    if not is_guest:
        charge(user_id, settings.cost_numerology, "numerology", {"module": "numerology"})
    try:
        report_path = numerology.generate_report(user_id, payload.full_name, payload.birth_date)
    except Exception as exc:
        if is_guest:
            new_balance = "Unlimited"
        else:
            new_balance = refund(user_id, settings.cost_numerology, "numerology_refund", {"module": "numerology"})
        return JSONResponse(status_code=500, content={"error": str(exc), "balance": new_balance})

    db.record_report(user_id, "numerology", report_path.name, str(report_path))
    db.record_history(user_id, "numerology", f"{payload.full_name};{payload.birth_date}", report_path.name)
    return {
        "success": True,
        "file_name": report_path.name,
        "file_url": f"/api/reports/{report_path.name}",
        "balance": "Unlimited" if is_guest else get_balance(user_id),
    }


@app.get("/api/reports/{file_name}")
def api_report(file_name: str):
    file_path = settings.reports_dir / file_name
    if not file_path.exists():
        return JSONResponse(status_code=404, content={"error": "Report not found"})
    return FileResponse(file_path, media_type="application/pdf", filename=file_name)


@app.post("/api/sovmestimost/by-names")
async def api_sovmestimost_names(
    payload: SovmestimostNamesRequest,
    identity: MaxIdentity | None = Depends(optional_max_auth),
):
    user_id, language, is_guest = _resolve_runtime_user(identity)
    if not is_guest:
        charge(user_id, settings.cost_sovmestimost, "sovmestimost_names", {"module": "sovmestimost"})
    try:
        result = compatibility.by_names(payload.name1, payload.name2, language)
    except Exception:
        if is_guest:
            new_balance = "Unlimited"
        else:
            new_balance = refund(
                user_id,
                settings.cost_sovmestimost,
                "sovmestimost_refund",
                {"module": "sovmestimost"},
            )
        return JSONResponse(status_code=502, content={"error": "AI service is unavailable", "balance": new_balance})

    db.record_history(user_id, "sovmestimost_names", f"{payload.name1};{payload.name2}", result)
    return {"success": True, "result": result, "balance": "Unlimited" if is_guest else get_balance(user_id)}


@app.post("/api/sovmestimost/by-names-dates")
async def api_sovmestimost_names_dates(
    payload: SovmestimostNamesDatesRequest,
    identity: MaxIdentity | None = Depends(optional_max_auth),
):
    user_id, language, is_guest = _resolve_runtime_user(identity)
    if not is_guest:
        charge(
            user_id,
            settings.cost_sovmestimost,
            "sovmestimost_names_dates",
            {"module": "sovmestimost"},
        )
    try:
        result = compatibility.by_names_dates(
            payload.name1,
            payload.date1,
            payload.name2,
            payload.date2,
            language,
        )
    except Exception as exc:
        if is_guest:
            new_balance = "Unlimited"
        else:
            new_balance = refund(
                user_id,
                settings.cost_sovmestimost,
                "sovmestimost_refund",
                {"module": "sovmestimost"},
            )
        status_code = 400 if "Invalid date format" in str(exc) else 502
        return JSONResponse(status_code=status_code, content={"error": str(exc), "balance": new_balance})

    db.record_history(
        user_id,
        "sovmestimost_names_dates",
        f"{payload.name1};{payload.date1};{payload.name2};{payload.date2}",
        result,
    )
    return {"success": True, "result": result, "balance": "Unlimited" if is_guest else get_balance(user_id)}
