from __future__ import annotations

import json
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from urllib.parse import urlencode

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.web.auth.email_auth import (
    EmailIdentity,
    ensure_seed_accounts,
    issue_email_auth_token,
    login_email_user,
    optional_email_auth,
    register_email_user,
)
from app.web.auth.max_auth import MaxIdentity, optional_max_auth, require_max_auth
from app.web.auth.telegram_auth import (
    TelegramIdentity,
    issue_telegram_auth_token,
    optional_telegram_auth,
    resolve_telegram_identity,
)
from app.web.db import db
from app.web.schemas import (
    EmailLoginRequest,
    EmailRegisterRequest,
    NumerologyRequest,
    SonnikRequest,
    SupportAddMessageRequest,
    SupportCreateTicketRequest,
    SovmestimostNamesDatesRequest,
    SovmestimostNamesRequest,
    TelegramVerifyRequest,
    YooKassaCreatePaymentRequest,
)
from app.web.services import compatibility, lunar, numerology, sonnik
from app.web.services.balance import charge, get_balance, record_transaction, refund
from app.web.services.payments import (
    cancel_payment,
    check_payment,
    create_payment,
    get_payment_packages,
    list_user_payments,
    sync_pending_payments,
)
from config import settings


BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init()
    ensure_seed_accounts()
    yield


app = FastAPI(title=settings.app_title, lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


def _normalize_lang(lang: str = "") -> str:
    return "en" if (lang or "").strip().lower() == "en" else "ru"


def _translations(lang: str) -> dict:
    if lang == "en":
        return {
            "cabinet": "Dashboard",
            "profile": "Profile",
            "refresh": "Refresh",
            "mode": "Mode",
            "guest": "Guest",
            "sonnik": "Dreambook",
            "numerology": "Numerology",
            "compatibility": "Compatibility",
            "topup": "Top Up",
            "home": "Home",
            "dream_description": "Dream description",
            "get_interpretation": "Get interpretation",
            "full_name": "Full name",
            "birth_date": "Birth date (DD.MM.YYYY)",
            "generate_pdf": "Generate PDF",
            "by_names": "By names",
            "by_names_dates": "By names and dates",
            "name_1": "Name 1",
            "name_2": "Name 2",
            "date_1": "Date 1 (DD.MM.YYYY)",
            "date_2": "Date 2 (DD.MM.YYYY)",
            "calc_compatibility": "Calculate compatibility",
            "yookassa_payment": "YooKassa payment",
            "spark_package": "Spark package",
            "create_payment": "Create payment",
            "check_payment": "Check payment",
            "soon": "Soon",
            "sparks": "Sparks",
            "email_auth": "Email auth",
            "register": "Register",
            "login": "Login",
            "email": "Email",
            "password": "Password",
            "username": "Username",
            "support": "Support",
            "history": "History",
            "lunar_calendar": "Lunar calendar",
            "admin_panel": "Admin panel",
            "subject": "Subject",
            "message": "Message",
            "send": "Send",
            "my_tickets": "My tickets",
            "open_ticket": "Open ticket",
            "request_history": "Request history",
            "module": "Module",
            "input": "Input",
            "output": "Output",
            "created_at": "Created at",
            "generate_report": "Generate report",
            "numerology_report": "Numerology report",
            "month": "Month",
            "year": "Year",
            "load": "Load",
        }
    return {
        "cabinet": "Кабинет",
        "profile": "Профиль",
        "refresh": "Обновить",
        "mode": "Режим",
        "guest": "Гость",
        "sonnik": "Сонник",
        "numerology": "Нумерология",
        "compatibility": "Совместимость",
        "topup": "Пополнение",
        "home": "На главную",
        "dream_description": "Описание сна",
        "get_interpretation": "Получить интерпретацию",
        "full_name": "Полное имя",
        "birth_date": "Дата рождения (ДД.ММ.ГГГГ)",
        "generate_pdf": "Сгенерировать PDF",
        "by_names": "По именам",
        "by_names_dates": "По именам и датам",
        "name_1": "Имя 1",
        "name_2": "Имя 2",
        "date_1": "Дата 1 (ДД.ММ.ГГГГ)",
        "date_2": "Дата 2 (ДД.ММ.ГГГГ)",
        "calc_compatibility": "Рассчитать совместимость",
        "yookassa_payment": "Оплата YooKassa",
        "spark_package": "Пакет искр",
        "create_payment": "Создать платеж",
        "check_payment": "Проверить оплату",
        "soon": "Скоро",
        "sparks": "Искры",
        "email_auth": "Авторизация по email",
        "register": "Регистрация",
        "login": "Вход",
        "email": "Email",
        "password": "Пароль",
        "username": "Ник",
        "support": "Поддержка",
        "history": "История",
        "lunar_calendar": "Лунный календарь",
        "admin_panel": "Админ-панель",
        "subject": "Тема",
        "message": "Сообщение",
        "send": "Отправить",
        "my_tickets": "Мои обращения",
        "open_ticket": "Создать обращение",
        "request_history": "История запросов",
        "module": "Модуль",
        "input": "Запрос",
        "output": "Ответ",
        "created_at": "Создано",
        "generate_report": "Сформировать разбор",
        "numerology_report": "Нумерологический разбор",
        "month": "Месяц",
        "year": "Год",
        "load": "Загрузить",
    }


def _is_recognized_request(request: Request, name: str = "", platform: str = "") -> bool:
    if name.strip() or platform.strip():
        return True
    if request.headers.get("X-Telegram-Init-Data"):
        return True
    if request.headers.get("X-Max-User-Id"):
        return True
    return False


def _client_url_with_query(name: str = "", platform: str = "", lang: str = "ru") -> str:
    params = {}
    if name.strip():
        params["name"] = name.strip()
    if platform.strip():
        params["platform"] = platform.strip().lower()
    params["lang"] = _normalize_lang(lang)
    if not params:
        return "/client"
    return f"/client?{urlencode(params)}"


def _extract_numerology_report_id(output_text: str) -> int | None:
    text = (output_text or "").strip()
    if not text.startswith("report_id="):
        return None
    try:
        return int(text.split("=", 1)[1])
    except ValueError:
        return None


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def root(
    request: Request,
    name: str = Query(default=""),
    platform: str = Query(default=""),
    lang: str = Query(default="ru"),
):
    page_lang = _normalize_lang(lang)
    if _is_recognized_request(request, name=name, platform=platform):
        return RedirectResponse(url=_client_url_with_query(name=name, platform=platform, lang=page_lang))

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
            "dev_auth_bypass": settings.dev_auth_bypass,
            "dev_auth_mock_username": settings.dev_auth_mock_username,
            "lang": page_lang,
            "t": _translations(page_lang),
        },
    )


@app.get("/app", response_class=HTMLResponse, include_in_schema=False)
async def web_app_page():
    return RedirectResponse(url="/client")


def _client_template_context(request: Request, lang: str) -> dict:
    page_lang = _normalize_lang(lang)
    initial_auth_username = _translations(page_lang)["guest"]
    initial_auth_provider = _translations(page_lang)["guest"]
    return {
        "request": request,
        "brand_name": "Astrolhub",
        "dev_auth_bypass": settings.dev_auth_bypass,
        "dev_auth_mock_username": settings.dev_auth_mock_username,
        "lang": page_lang,
        "t": _translations(page_lang),
        "initial_auth_username": initial_auth_username,
        "initial_auth_provider": initial_auth_provider,
    }


@app.get("/client", response_class=HTMLResponse, include_in_schema=False)
async def client_dashboard(request: Request, lang: str = Query(default="ru")):
    return templates.TemplateResponse(
        request=request,
        name="client_dashboard.html",
        context=_client_template_context(request, lang),
    )


@app.get("/client/sonnik", response_class=HTMLResponse, include_in_schema=False)
async def client_sonnik(request: Request, lang: str = Query(default="ru")):
    return templates.TemplateResponse(
        request=request,
        name="client_sonnik.html",
        context=_client_template_context(request, lang),
    )


@app.get("/client/numerology", response_class=HTMLResponse, include_in_schema=False)
async def client_numerology(request: Request, lang: str = Query(default="ru")):
    return templates.TemplateResponse(
        request=request,
        name="client_numerology.html",
        context=_client_template_context(request, lang),
    )


@app.get("/client/compatibility", response_class=HTMLResponse, include_in_schema=False)
async def client_compatibility(request: Request, lang: str = Query(default="ru")):
    return templates.TemplateResponse(
        request=request,
        name="client_compatibility.html",
        context=_client_template_context(request, lang),
    )


@app.get("/client/topup", response_class=HTMLResponse, include_in_schema=False)
async def client_topup(request: Request, lang: str = Query(default="ru")):
    return templates.TemplateResponse(
        request=request,
        name="client_topup.html",
        context=_client_template_context(request, lang),
    )


@app.get("/client/profile", response_class=HTMLResponse, include_in_schema=False)
async def client_profile(request: Request, lang: str = Query(default="ru")):
    return templates.TemplateResponse(
        request=request,
        name="client_profile.html",
        context=_client_template_context(request, lang),
    )


@app.get("/client/support", response_class=HTMLResponse, include_in_schema=False)
async def client_support(request: Request, lang: str = Query(default="ru")):
    return templates.TemplateResponse(
        request=request,
        name="client_support.html",
        context=_client_template_context(request, lang),
    )


@app.get("/client/lunar", response_class=HTMLResponse, include_in_schema=False)
async def client_lunar(request: Request, lang: str = Query(default="ru")):
    return templates.TemplateResponse(
        request=request,
        name="client_lunar.html",
        context=_client_template_context(request, lang),
    )


@app.get("/client/numerology/report/{report_id}", response_class=HTMLResponse, include_in_schema=False)
async def client_numerology_report(
    report_id: int,
    request: Request,
    lang: str = Query(default="ru"),
):
    return templates.TemplateResponse(
        request=request,
        name="client_numerology_report.html",
        context={**_client_template_context(request, lang), "report_id": report_id},
    )


@app.get("/admin", response_class=HTMLResponse, include_in_schema=False)
async def admin_dashboard(
    request: Request,
    lang: str = Query(default="ru"),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    _admin_user_id = _require_admin_email_user(email_identity)
    return templates.TemplateResponse(
        request=request,
        name="admin_dashboard.html",
        context=_client_template_context(request, lang),
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/mini-app")
async def mini_app(
    request: Request,
    name: str = Query(default=""),
    platform: str = Query(default=""),
    lang: str = Query(default="ru"),
):
    page_lang = _normalize_lang(lang)
    if _is_recognized_request(request, name=name, platform=platform):
        return RedirectResponse(url=_client_url_with_query(name=name, platform=platform, lang=page_lang))

    safe_platform = platform.lower().strip() or "unknown"
    safe_name = name.strip() or "Unknown user"
    return templates.TemplateResponse(
        request=request,
        name="mini_app.html",
        context={
            "name": safe_name,
            "platform": safe_platform,
            "lang": page_lang,
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


@app.post("/api/auth/telegram/verify")
async def verify_telegram_auth(payload: TelegramVerifyRequest):
    identity, is_new_user = resolve_telegram_identity(payload.init_data)
    token = issue_telegram_auth_token(identity)
    if is_new_user:
        record_transaction(
            identity.internal_user_id,
            settings.starting_credits,
            "signup_bonus",
            "telegram_welcome_bonus",
            {"provider": "telegram"},
        )
    response_data = {
        "success": True,
        "token": token,
        "profile": {
            "provider": "telegram",
            "provider_user_id": identity.user_id,
            "username": identity.username,
            "language": identity.language,
        },
        "balance": get_balance(identity.internal_user_id),
    }
    response = JSONResponse(content=response_data)
    response.set_cookie(
        key="telegram_auth_token",
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=settings.email_auth_ttl_seconds,
        path="/",
    )
    return response


@app.post("/api/auth/email/register")
async def register_email(payload: EmailRegisterRequest):
    identity = register_email_user(
        email=payload.email,
        password=payload.password,
        username=payload.username,
        language=payload.language,
    )
    token = issue_email_auth_token(identity)
    response_data = {
        "success": True,
        "token": token,
        "profile": {
            "provider": "email",
            "provider_user_id": identity.user_id,
            "username": identity.username,
            "language": identity.language,
        },
        "balance": get_balance(identity.internal_user_id),
    }
    response = JSONResponse(content=response_data)
    response.set_cookie(
        key="email_auth_token",
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=settings.email_auth_ttl_seconds,
        path="/",
    )
    return response


@app.post("/api/auth/email/login")
async def login_email(payload: EmailLoginRequest):
    identity = login_email_user(email=payload.email, password=payload.password)
    token = issue_email_auth_token(identity)
    response_data = {
        "success": True,
        "token": token,
        "profile": {
            "provider": "email",
            "provider_user_id": identity.user_id,
            "username": identity.username,
            "language": identity.language,
        },
        "balance": get_balance(identity.internal_user_id),
    }
    response = JSONResponse(content=response_data)
    response.set_cookie(
        key="email_auth_token",
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=settings.email_auth_ttl_seconds,
        path="/",
    )
    return response


@app.get("/api/profile")
async def profile(
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    if email_identity:
        return {
            "provider": "email",
            "provider_user_id": email_identity.user_id,
            "username": email_identity.username,
            "language": email_identity.language,
        }
    if max_identity:
        return {
            "provider": "max",
            "provider_user_id": max_identity.user_id,
            "username": max_identity.username,
            "language": max_identity.language,
        }
    if telegram_identity:
        return {
            "provider": "telegram",
            "provider_user_id": telegram_identity.user_id,
            "username": telegram_identity.username,
            "language": telegram_identity.language,
        }
    return {
        "provider": "guest",
        "provider_user_id": "public-web",
        "username": "Guest",
        "language": "ru",
    }


@app.get("/api/balance")
async def balance(
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    return {"balance": get_balance(user_id)}


@app.get("/api/history/requests")
async def api_request_history(
    limit: int = Query(default=30, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    module: str = Query(default=""),
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    rows = db.list_request_history(user_id=user_id, limit=limit, offset=offset, module=module.strip() or None)
    items = []
    for row in rows:
        item = dict(row)
        report_id = _extract_numerology_report_id(item.get("output_text", ""))
        if item.get("module") == "numerology" and report_id:
            item["report_id"] = report_id
            item["report_url"] = f"/client/numerology/report/{report_id}"
        items.append(item)
    return {"success": True, "items": items}


@app.post("/api/support/tickets")
async def api_create_support_ticket(
    payload: SupportCreateTicketRequest,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    ticket_id = db.create_support_ticket(
        user_id=user_id,
        subject=payload.subject.strip(),
        message_text=payload.message_text.strip(),
    )
    return {"success": True, "ticket_id": ticket_id}


@app.get("/api/support/tickets")
async def api_list_support_tickets(
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    rows = db.list_support_tickets_for_user(user_id=user_id)
    return {"success": True, "tickets": [dict(row) for row in rows]}


@app.get("/api/support/tickets/{ticket_id}")
async def api_support_ticket_details(
    ticket_id: int,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    ticket = db.get_support_ticket(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    messages = db.list_support_messages(ticket_id=ticket_id)
    return {"success": True, "ticket": dict(ticket), "messages": [dict(row) for row in messages]}


@app.post("/api/support/tickets/{ticket_id}/messages")
async def api_support_ticket_add_message(
    ticket_id: int,
    payload: SupportAddMessageRequest,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    ticket = db.get_support_ticket(ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    db.add_support_message(ticket_id=ticket_id, author_user_id=user_id, message_text=payload.message_text.strip())
    messages = db.list_support_messages(ticket_id=ticket_id)
    return {"success": True, "messages": [dict(row) for row in messages]}


@app.get("/api/lunar/month")
async def api_lunar_month(
    year: int | None = Query(default=None, ge=1970, le=2100),
    month: int | None = Query(default=None, ge=1, le=12),
):
    today = date.today()
    resolved_year = year or today.year
    resolved_month = month or today.month
    return {"success": True, **lunar.get_lunar_month(year=resolved_year, month=resolved_month)}


def _require_authenticated_user(
    max_identity: MaxIdentity | None,
    telegram_identity: TelegramIdentity | None,
    email_identity: EmailIdentity | None,
) -> tuple[int, str]:
    if email_identity:
        return email_identity.internal_user_id, "email"
    if max_identity:
        return max_identity.internal_user_id, "max"
    if telegram_identity:
        return telegram_identity.internal_user_id, "telegram"
    raise HTTPException(status_code=401, detail="Authentication is required")


def _require_admin_email_user(email_identity: EmailIdentity | None) -> int:
    if not email_identity:
        raise HTTPException(status_code=401, detail="Admin access requires email authentication")
    if not db.is_user_admin(email_identity.internal_user_id):
        raise HTTPException(status_code=403, detail="Admin access denied")
    return email_identity.internal_user_id


@app.get("/api/payments/packages")
async def payment_packages():
    return {"packages": get_payment_packages()}


@app.post("/api/payments/yookassa/create")
async def api_create_yookassa_payment(
    payload: YooKassaCreatePaymentRequest,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    payment = create_payment(user_id=user_id, package_id=payload.package_id, receipt_email=payload.receipt_email)
    return {"success": True, "provider": provider, **payment}


@app.post("/api/payments/yookassa/{payment_id}/check")
async def api_check_yookassa_payment(
    payment_id: str,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    result = check_payment(payment_id, requester_user_id=user_id)
    owner_balance = get_balance(user_id)
    result["balance"] = owner_balance
    return {"success": True, **result}


@app.get("/api/payments/yookassa/history")
async def api_payments_history(
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    payments = list_user_payments(user_id=user_id)
    return {"success": True, "payments": payments, "balance": get_balance(user_id)}


@app.post("/api/payments/yookassa/{payment_id}/cancel")
async def api_cancel_yookassa_payment(
    payment_id: str,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    result = cancel_payment(payment_id=payment_id, requester_user_id=user_id)
    result["balance"] = get_balance(user_id)
    return {"success": True, **result}


@app.post("/api/payments/yookassa/sync-pending")
async def api_sync_pending_yookassa_payments(
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    synced = sync_pending_payments(user_id=user_id, limit=2)
    return {"success": True, "synced": synced, "balance": get_balance(user_id)}


@app.get("/api/admin/stats/overview")
async def api_admin_stats_overview(email_identity: EmailIdentity | None = Depends(optional_email_auth)):
    _admin_user_id = _require_admin_email_user(email_identity)
    return {"success": True, **db.get_admin_overview_stats()}


@app.get("/api/admin/me")
async def api_admin_me(email_identity: EmailIdentity | None = Depends(optional_email_auth)):
    if not email_identity:
        return {"is_admin": False}
    return {"is_admin": db.is_user_admin(email_identity.internal_user_id)}


@app.get("/api/admin/stats/modules")
async def api_admin_stats_modules(email_identity: EmailIdentity | None = Depends(optional_email_auth)):
    _admin_user_id = _require_admin_email_user(email_identity)
    return {"success": True, "modules": [dict(row) for row in db.get_admin_module_stats()]}


@app.get("/api/admin/support/tickets")
async def api_admin_support_tickets(
    status: str = Query(default=""),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    _admin_user_id = _require_admin_email_user(email_identity)
    rows = db.list_support_tickets_admin(status=status.strip() or None)
    return {"success": True, "tickets": [dict(row) for row in rows]}


@app.get("/api/admin/support/tickets/{ticket_id}")
async def api_admin_support_ticket_details(
    ticket_id: int,
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    _admin_user_id = _require_admin_email_user(email_identity)
    ticket = db.get_support_ticket(ticket_id=ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    messages = db.list_support_messages(ticket_id=ticket_id)
    return {"success": True, "ticket": dict(ticket), "messages": [dict(row) for row in messages]}


@app.post("/api/sonnik/interpret")
async def api_sonnik(
    payload: SonnikRequest,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    charge(user_id, settings.cost_sonnik, "sonnik", {"module": "sonnik"})
    try:
        interpretation = sonnik.interpret_dream(payload.dream_text)
    except HTTPException as exc:
        new_balance = refund(user_id, settings.cost_sonnik, "sonnik_refund", {"module": "sonnik"})
        return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail), "balance": new_balance})
    except Exception as exc:
        new_balance = refund(user_id, settings.cost_sonnik, "sonnik_refund", {"module": "sonnik"})
        return JSONResponse(status_code=502, content={"error": f"Unexpected AI error: {exc}", "balance": new_balance})

    db.record_history(user_id, "sonnik", payload.dream_text, interpretation)
    return {"success": True, "interpretation": interpretation, "balance": get_balance(user_id)}


@app.post("/api/numerology/generate")
async def api_numerology(
    payload: NumerologyRequest,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    charge(user_id, settings.cost_numerology, "numerology", {"module": "numerology"})
    try:
        report_payload = numerology.generate_web_report(payload.full_name, payload.birth_date)
    except HTTPException as exc:
        new_balance = refund(user_id, settings.cost_numerology, "numerology_refund", {"module": "numerology"})
        return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail), "balance": new_balance})
    except Exception as exc:
        new_balance = refund(user_id, settings.cost_numerology, "numerology_refund", {"module": "numerology"})
        return JSONResponse(status_code=500, content={"error": str(exc), "balance": new_balance})

    report_id = db.record_html_report(
        user_id=user_id,
        module="numerology",
        title=f"Numerology: {payload.full_name}",
        content_json=json.dumps(report_payload, ensure_ascii=False),
    )
    db.record_history(
        user_id,
        "numerology",
        f"{payload.full_name};{payload.birth_date}",
        f"report_id={report_id}",
    )
    return {
        "success": True,
        "report_id": report_id,
        "report_url": f"/client/numerology/report/{report_id}",
        "balance": get_balance(user_id),
    }


@app.get("/api/numerology/report/{report_id}")
async def api_numerology_report(
    report_id: int,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    row = db.get_html_report(report_id=report_id, user_id=user_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    content = json.loads(row["content_json"] or "{}")
    return {"success": True, "report": content, "title": row["title"], "created_at": row["created_at"]}


@app.get("/api/reports/{file_name}")
def api_report(file_name: str):
    file_path = settings.reports_dir / file_name
    if not file_path.exists():
        return JSONResponse(status_code=404, content={"error": "Report not found"})
    return FileResponse(file_path, media_type="application/pdf", filename=file_name)


@app.post("/api/sovmestimost/by-names")
async def api_sovmestimost_names(
    payload: SovmestimostNamesRequest,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    language = email_identity.language if email_identity else (max_identity.language if max_identity else telegram_identity.language)
    charge(user_id, settings.cost_sovmestimost, "sovmestimost_names", {"module": "sovmestimost"})
    try:
        result = compatibility.by_names(payload.name1, payload.name2, language)
    except HTTPException as exc:
        new_balance = refund(
            user_id,
            settings.cost_sovmestimost,
            "sovmestimost_refund",
            {"module": "sovmestimost"},
        )
        return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail), "balance": new_balance})
    except Exception as exc:
        new_balance = refund(
            user_id,
            settings.cost_sovmestimost,
            "sovmestimost_refund",
            {"module": "sovmestimost"},
        )
        return JSONResponse(status_code=502, content={"error": f"Unexpected AI error: {exc}", "balance": new_balance})

    db.record_history(user_id, "sovmestimost_names", f"{payload.name1};{payload.name2}", result)
    return {"success": True, "result": result, "balance": get_balance(user_id)}


@app.post("/api/sovmestimost/by-names-dates")
async def api_sovmestimost_names_dates(
    payload: SovmestimostNamesDatesRequest,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    language = email_identity.language if email_identity else (max_identity.language if max_identity else telegram_identity.language)
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
    except HTTPException as exc:
        new_balance = refund(
            user_id,
            settings.cost_sovmestimost,
            "sovmestimost_refund",
            {"module": "sovmestimost"},
        )
        return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail), "balance": new_balance})
    except Exception as exc:
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
    return {"success": True, "result": result, "balance": get_balance(user_id)}
