from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.auth.max_auth import MaxIdentity, require_max_auth
from app.config import (
    APP_NAME,
    COST_NUMEROLOGY,
    COST_SONNIK,
    COST_SOVMESTIMOST,
    COST_TAROT,
    DEBUG,
    HOST,
    PORT,
)
from app.db import db
from app.schemas import (
    NumerologyRequest,
    SonnikRequest,
    SovmestimostNamesDatesRequest,
    SovmestimostNamesRequest,
    TarotRequest,
)
from app.services import compatibility, numerology, sonnik, tarot
from app.services.balance import charge, get_balance, refund


BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"

@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init()
    yield


app = FastAPI(title=APP_NAME, debug=DEBUG, lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


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
async def profile(identity: MaxIdentity = Depends(require_max_auth)):
    return {
        "provider": "max",
        "provider_user_id": identity.user_id,
        "username": identity.username,
        "language": identity.language,
    }


@app.get("/api/balance")
async def balance(identity: MaxIdentity = Depends(require_max_auth)):
    return {"balance": get_balance(identity.internal_user_id)}


@app.post("/api/sonnik/interpret")
async def api_sonnik(payload: SonnikRequest, identity: MaxIdentity = Depends(require_max_auth)):
    user_id = identity.internal_user_id
    charge(user_id, COST_SONNIK, "sonnik", {"module": "sonnik"})
    try:
        interpretation = sonnik.interpret_dream(payload.dream_text)
    except Exception:
        new_balance = refund(user_id, COST_SONNIK, "sonnik_refund", {"module": "sonnik"})
        return JSONResponse(status_code=502, content={"error": "AI service is unavailable", "balance": new_balance})

    db.record_history(user_id, "sonnik", payload.dream_text, interpretation)
    return {"success": True, "interpretation": interpretation, "balance": get_balance(user_id)}


@app.post("/api/numerology/generate")
async def api_numerology(payload: NumerologyRequest, identity: MaxIdentity = Depends(require_max_auth)):
    user_id = identity.internal_user_id
    charge(user_id, COST_NUMEROLOGY, "numerology", {"module": "numerology"})
    try:
        report_path = numerology.generate_report(user_id, payload.full_name, payload.birth_date)
    except Exception as exc:
        new_balance = refund(user_id, COST_NUMEROLOGY, "numerology_refund", {"module": "numerology"})
        return JSONResponse(status_code=500, content={"error": str(exc), "balance": new_balance})

    db.record_report(user_id, "numerology", report_path.name, str(report_path))
    db.record_history(user_id, "numerology", f"{payload.full_name};{payload.birth_date}", report_path.name)
    return {"success": True, "file_name": report_path.name, "file_url": f"/api/reports/{report_path.name}", "balance": get_balance(user_id)}


@app.get("/api/reports/{file_name}")
def api_report(file_name: str):
    file_path = BASE_DIR / "reports" / file_name
    if not file_path.exists():
        return JSONResponse(status_code=404, content={"error": "Report not found"})
    return FileResponse(file_path, media_type="application/pdf", filename=file_name)


@app.post("/api/sovmestimost/by-names")
async def api_sovmestimost_names(payload: SovmestimostNamesRequest, identity: MaxIdentity = Depends(require_max_auth)):
    user_id = identity.internal_user_id
    charge(user_id, COST_SOVMESTIMOST, "sovmestimost_names", {"module": "sovmestimost"})
    try:
        result = compatibility.by_names(payload.name1, payload.name2, identity.language)
    except Exception:
        new_balance = refund(user_id, COST_SOVMESTIMOST, "sovmestimost_refund", {"module": "sovmestimost"})
        return JSONResponse(status_code=502, content={"error": "AI service is unavailable", "balance": new_balance})

    db.record_history(user_id, "sovmestimost_names", f"{payload.name1};{payload.name2}", result)
    return {"success": True, "result": result, "balance": get_balance(user_id)}


@app.post("/api/sovmestimost/by-names-dates")
async def api_sovmestimost_names_dates(payload: SovmestimostNamesDatesRequest, identity: MaxIdentity = Depends(require_max_auth)):
    user_id = identity.internal_user_id
    charge(user_id, COST_SOVMESTIMOST, "sovmestimost_names_dates", {"module": "sovmestimost"})
    try:
        result = compatibility.by_names_dates(payload.name1, payload.date1, payload.name2, payload.date2, identity.language)
    except Exception as exc:
        new_balance = refund(user_id, COST_SOVMESTIMOST, "sovmestimost_refund", {"module": "sovmestimost"})
        status_code = 400 if "Invalid date format" in str(exc) else 502
        return JSONResponse(status_code=status_code, content={"error": str(exc), "balance": new_balance})

    db.record_history(
        user_id,
        "sovmestimost_names_dates",
        f"{payload.name1};{payload.date1};{payload.name2};{payload.date2}",
        result,
    )
    return {"success": True, "result": result, "balance": get_balance(user_id)}


@app.post("/api/tarot/reading")
async def api_tarot(payload: TarotRequest, identity: MaxIdentity = Depends(require_max_auth)):
    user_id = identity.internal_user_id
    charge(user_id, COST_TAROT, "tarot", {"module": "tarot", "spread_size": payload.spread_size})
    try:
        reading = tarot.tarot_reading(payload.question, payload.spread_size, identity.language)
    except Exception:
        new_balance = refund(user_id, COST_TAROT, "tarot_refund", {"module": "tarot"})
        return JSONResponse(status_code=502, content={"error": "AI service is unavailable", "balance": new_balance})

    db.record_history(user_id, "tarot", payload.question, reading["interpretation"])
    return {"success": True, "cards": reading["cards"], "interpretation": reading["interpretation"], "balance": get_balance(user_id)}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT)
