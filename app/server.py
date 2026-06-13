from __future__ import annotations

import json
import re
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlencode
from datetime import date, timedelta

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.concurrency import run_in_threadpool

from app.web.auth.email_auth import (
    EmailIdentity,
    complete_email_registration,
    confirm_password_reset,
    ensure_seed_accounts,
    has_pending_registration,
    issue_email_auth_token,
    login_email_user,
    normalize_email,
    optional_email_auth,
    request_password_reset,
    resend_registration_code,
    start_email_registration,
    verify_email_registration,
)
from app.web.auth.max_auth import MaxIdentity, optional_max_auth, require_max_auth
from app.web.auth.telegram_auth import (
    TelegramIdentity,
    issue_telegram_auth_token,
    issue_telegram_username_login_url,
    optional_telegram_auth,
    resolve_telegram_identity,
    resolve_telegram_username_link_to_identity,
    verify_telegram_bot_bearer,
)
from app.web.db import db
from app.web.schemas import (
    AdminAdjustCreditsRequest,
    AdminSetRoleRequest,
    AdminSupportReplyRequest,
    AdminTicketStatusRequest,
    EmailLoginRequest,
    EmailPasswordResetConfirmRequest,
    EmailResendRequest,
    EmailRegisterStartRequest,
    EmailRegisterVerifyRequest,
    NumerologyRequest,
    PersonaCreateRequest,
    PersonaUpdateRequest,
    SonnikRequest,
    SupportAddMessageRequest,
    SupportCreateTicketRequest,
    SovmestimostNamesDatesRequest,
    SovmestimostNamesRequest,
    AstrologyForecastRequest,
    TarotCardDrawRequest,
    TarotCardReadingRequest,
    TarotRequest,
    TelegramLinkVerifyRequest,
    TelegramMintUsernameLinkRequest,
    TelegramVerifyRequest,
    YooKassaCreatePaymentRequest,
)
from app.web.services import compatibility, divination, numerology, payments, sonnik, tarot_cards
from app.web.services.balance import admin_debit, charge, credit, get_balance, record_transaction, refund
from config import settings


BASE_DIR = Path(__file__).resolve().parent
TEMPLATES_DIR = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static"
PUBLIC_OFFER_FILE_CANDIDATES = (
    BASE_DIR.parent / "Публичная оферта.pdf",
    BASE_DIR.parent / "bots228" / "numerology" / "Публичная оферта.pdf",
    BASE_DIR.parent / "bots228" / "sonnik" / "Публичная оферта.pdf",
    BASE_DIR.parent / "bots228" / "sovmestimost" / "Публичная оферта.pdf",
)
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init()
    ensure_seed_accounts()
    yield


app = FastAPI(title=settings.app_title, lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


def _normalize_lang(lang: str = "") -> str:
    raw = (lang or "").strip().lower()
    if raw in {"ru", "en"}:
        return raw
    return settings.app_default_lang


def _validate_tarot_spread(spread: str) -> str:
    normalized = (spread or "natal_map").strip()
    if normalized not in divination.SPREAD_LABELS:
        raise HTTPException(status_code=400, detail="Invalid tarot spread")
    return "natal_map"


def _validate_card_reading_topic(topic: str) -> str:
    normalized = (topic or "full_portrait").strip()
    if normalized not in divination.CARD_READING_TOPICS:
        raise HTTPException(status_code=400, detail="Invalid card reading topic")
    return normalized


def _service_failure_message(service: str, language: str) -> str:
    messages = {
        "compatibility": {
            "ru": "Не удалось рассчитать совместимость, попробуйте позже",
            "en": "Could not calculate compatibility, please try again later",
        },
        "numerology": {
            "ru": "Не удалось сформировать разбор, попробуйте позже",
            "en": "Could not generate the reading, please try again later",
        },
        "reading": {
            "ru": "Не удалось сформировать разбор, попробуйте позже",
            "en": "Could not generate the reading, please try again later",
        },
        "sonnik": {
            "ru": "Не удалось получить толкование, попробуйте позже",
            "en": "Could not interpret the dream, please try again later",
        },
        "astrology": {
            "ru": "Не удалось построить прогноз, попробуйте позже",
            "en": "Could not build the forecast, please try again later",
        },
    }
    lang = _normalize_lang(language)
    return messages.get(service, messages["reading"]).get(lang, messages.get(service, messages["reading"])["ru"])


def _public_error_detail(exc: HTTPException, service: str, language: str) -> str:
    if exc.status_code >= 500:
        return _service_failure_message(service, language)
    return str(exc.detail)


def _validate_optional_birth_time(value: str) -> str:
    normalized = (value or "").strip()
    if not normalized:
        return ""
    if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", normalized):
        raise HTTPException(status_code=400, detail="Invalid birth time format. Use HH:MM")
    return normalized


def _clean_persona_payload(payload: PersonaCreateRequest | PersonaUpdateRequest) -> dict[str, str]:
    birth_date = payload.birth_date.strip()
    compatibility.parse_date(birth_date)
    return {
        "name": payload.name.strip(),
        "birth_date": birth_date,
        "birth_time": _validate_optional_birth_time(payload.birth_time),
        "birth_place": payload.birth_place.strip(),
        "note": payload.note.strip(),
    }


def _serialize_persona(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "birth_date": row["birth_date"],
        "birth_time": row["birth_time"] or "",
        "birth_place": row["birth_place"] or "",
        "note": row["note"] or "",
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _persona_context_from_values(
    user_id: int,
    persona_id: int = 0,
    name: str = "",
    birth_date: str = "",
    birth_time: str = "",
    birth_place: str = "",
    note: str = "",
    required: bool = True,
) -> dict | None:
    if persona_id:
        row = db.get_persona(user_id=user_id, persona_id=persona_id)
        if not row:
            raise HTTPException(status_code=404, detail="Persona not found")
        return _serialize_persona(row)

    name = name.strip()
    birth_date = birth_date.strip()
    birth_time = _validate_optional_birth_time(birth_time)
    birth_place = birth_place.strip()
    note = note.strip()
    if not required and not (name or birth_date or birth_time or birth_place or note):
        return None
    if not name or not birth_date:
        raise HTTPException(status_code=400, detail="Choose a saved persona or enter name and birth date")
    if birth_date:
        compatibility.parse_date(birth_date)
    return {
        "name": name,
        "birth_date": birth_date,
        "birth_time": birth_time,
        "birth_place": birth_place,
        "note": note,
    }


def _tarot_persona_context(user_id: int, payload: TarotRequest) -> dict | None:
    return _persona_context_from_values(
        user_id=user_id,
        persona_id=payload.persona_id,
        name=payload.persona_name,
        birth_date=payload.persona_birth_date,
        birth_time=payload.persona_birth_time,
        birth_place=payload.persona_birth_place,
        note=payload.persona_note,
        required=True,
    )


def _landing_telegram_bot_url(lang: str) -> str:
    page_lang = _normalize_lang(lang)
    if page_lang == "en":
        return settings.telegram_bot_url_en or settings.telegram_bot_url_ru
    return settings.telegram_bot_url_ru or settings.telegram_bot_url_en


def _auth_cookie_secure() -> bool:
    return settings.app_base_url.lower().startswith("https://")


def _auth_cookie_samesite() -> str:
    return "none" if _auth_cookie_secure() else "lax"


def _set_telegram_auth_cookie(response: JSONResponse, token: str) -> None:
    response.set_cookie(
        key="telegram_auth_token",
        value=token,
        httponly=True,
        secure=_auth_cookie_secure(),
        samesite=_auth_cookie_samesite(),
        max_age=settings.telegram_auth_ttl_seconds,
        path="/",
    )


def _set_email_auth_cookie(response: JSONResponse, token: str) -> None:
    response.set_cookie(
        key="email_auth_token",
        value=token,
        httponly=True,
        secure=_auth_cookie_secure(),
        samesite=_auth_cookie_samesite(),
        max_age=settings.email_auth_ttl_seconds,
        path="/",
    )


def _clear_auth_cookies(response: JSONResponse) -> None:
    secure = _auth_cookie_secure()
    samesite = _auth_cookie_samesite()
    for key in ("email_auth_token", "telegram_auth_token"):
        response.delete_cookie(key=key, path="/", secure=secure, samesite=samesite)


def _email_auth_response(identity: EmailIdentity, is_new_user: bool = False) -> JSONResponse:
    token = issue_email_auth_token(identity)
    response_data = {
        "success": True,
        "is_new_user": is_new_user,
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
    _set_email_auth_cookie(response, token)
    return response


def _resolve_language(
    email_identity: EmailIdentity | None,
    max_identity: MaxIdentity | None,
    telegram_identity: TelegramIdentity | None,
) -> str:
    if email_identity:
        return email_identity.language
    if max_identity:
        return max_identity.language
    if telegram_identity:
        return telegram_identity.language
    return "ru"


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
            "tarot": "Astrology",
            "natal_maps": "Astrology",
            "tarot_cards": "Tarot",
            "astrology": "Astrology Forecast",
            "topup": "Top Up",
            "home": "Home",
            "dream_description": "Dream description",
            "get_interpretation": "Get interpretation",
            "cost_label": "Cost",
            "sign_in_required_title": "Sign in to continue",
            "sign_in_required_text": "Create an account or log in to use this tool and keep your results in history.",
            "sign_in_required_action": "Log in",
            "full_name": "Full name",
            "birth_date": "Birth date (DD.MM.YYYY)",
            "generate_pdf": "Generate PDF",
            "by_names": "By names",
            "by_names_dates": "By names and dates",
            "tarot_question": "Additional context",
            "tarot_spread": "Spread",
            "tarot_spread_three_cards": "Three cards",
            "tarot_spread_choice": "Choice",
            "tarot_spread_relationship": "Relationship",
            "tarot_cards_question": "Question or situation",
            "tarot_cards_choose_hint": "The deck is drawing three cards. The question form will appear after the cards are on the table.",
            "tarot_cards_selected": "Selected cards",
            "get_tarot_cards_reading": "Get tarot reading",
            "get_tarot_reading": "Get natal chart",
            "open_natal_map_form": "Open natal chart form",
            "persona_required_error": "Choose a saved persona or enter at least name and birth date.",
            "personas": "Personas",
            "my_personas": "My personas",
            "persona_use_saved": "Choose",
            "persona_manual": "Enter",
            "persona_save_offer": "Save this persona for future readings",
            "persona_save": "Save persona",
            "persona_add": "Add persona",
            "persona_update": "Update persona",
            "persona_delete": "Delete",
            "persona_empty": "No saved personas yet",
            "persona_name": "Persona name",
            "persona_note": "Note",
            "persona_saved": "Persona saved",
            "persona_deleted": "Persona deleted",
            "persona_select_placeholder": "Choose persona",
            "back_to_natal_maps": "Back to Astrology",
            "astrology_name": "Name",
            "astrology_birth_time": "Birth time (optional)",
            "astrology_birth_place": "Birth place (optional)",
            "astrology_focus": "Question or focus",
            "get_astrology_forecast": "Get forecast",
            "name_1": "Name 1",
            "name_2": "Name 2",
            "date_1": "Date 1 (DD.MM.YYYY)",
            "date_2": "Date 2 (DD.MM.YYYY)",
            "calc_compatibility": "Calculate compatibility",
            "yookassa_payment": "YooKassa payment",
            "spark_package": "Spark package",
            "create_payment": "Create payment",
            "check_payment": "Check payment",
            "receipt_email": "Receipt email",
            "public_offer_ack_prefix": "I have read the terms of the",
            "public_offer_ack_link": "public offer",
            "soon": "Soon",
            "sparks": "Sparks",
            "email_auth": "Email auth",
            "register": "Register",
            "login": "Login",
            "email": "Email",
            "password": "Password",
            "repeat_password": "Repeat password",
            "verification_code": "Verification code",
            "send_code": "Send code",
            "confirm_registration": "Confirm registration",
            "password_reset": "Change password",
            "code_sent": "Code sent to your email",
            "auth_cell_open": "Sign in with email",
            "have_account": "Already have an account?",
            "no_account": "No account yet?",
            "go_to_login": "Log in",
            "go_to_register": "Register",
            "verify_registration": "Confirm registration",
            "back": "Back",
            "close": "Close",
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
            "logout": "Log out",
            "admin_users": "Users",
            "admin_find_user": "Find user",
            "admin_user_lookup": "User ID or email",
            "admin_sparks_amount": "Sparks (+ add / − subtract)",
            "admin_sparks_reason": "Reason",
            "admin_apply_credits": "Apply",
            "admin_user_not_found": "User not found",
            "mobile_hero_description": "Your personal insights",
            "feature_sonnik_desc": "AI-powered dream interpretation with symbols and context.",
            "feature_numerology_desc": "Personal report based on full name and birth date.",
            "feature_compatibility_desc": "Relationship and compatibility analysis in two modes.",
            "feature_tarot_desc": "Personal astrology-style maps for money, love, career, strengths, and life patterns.",
            "feature_tarot_cards_desc": "Classic tarot reading with cards, spreads, and symbolic guidance.",
            "feature_astrology_desc": "Personal astrological forecast by date, place, and current focus.",
            "feature_lunar_desc": "Lunar calendar will be available soon.",
            "landing_title": "Astrolhub - Dreambook, Numerology, Compatibility",
            "landing_nav_features": "Features",
            "landing_nav_how": "How it works",
            "landing_nav_about": "About",
            "landing_open_web_cabinet": "Open web cabinet",
            "landing_eyebrow": "AI services for personal insights",
            "landing_h1": "Dreambook, numerology, and compatibility in one digital space",
            "landing_guest_text": "Open the web service in your browser or access it through the Telegram bot.",
            "landing_open_tg_bot": "Open Telegram bot",
            "landing_recognized_text": (
                "User recognized. Open the workspace and use the full toolkit: "
                "dream interpretation, numerology PDF generation, and compatibility analysis."
            ),
            "landing_open_full": "Open full functionality",
            "landing_recognized_meta_default": "You are signed in via an external channel",
            "landing_available_title": "What's available",
            "landing_available_1": "Dreambook with AI interpretation",
            "landing_available_2": "Personal numerology PDF report",
            "landing_available_3": "Compatibility analysis (2 modes)",
            "landing_features_title": "Functionality",
            "landing_features_subtitle": (
                "Each tool covers a specific scenario: quick insight, deep interpretation, "
                "or comparative analysis."
            ),
            "landing_feature_dream_title": "Dreambook",
            "landing_feature_dream_text": (
                "Describe your dream in free text and get meaningful AI interpretation "
                "with focus on symbols and context."
            ),
            "landing_feature_numerology_title": "Numerology",
            "landing_feature_numerology_text": (
                "A personal PDF report is generated from full name and birth date, "
                "so you can save and revisit it."
            ),
            "landing_feature_compatibility_title": "Compatibility",
            "landing_feature_compatibility_text": (
                "Two analysis modes: by names or by names+birth dates for deeper, "
                "more precise results."
            ),
            "landing_how_title": "How it works",
            "landing_step_1_title": "Recognition",
            "landing_step_1_text": (
                "The platform detects sign-in context from Telegram/MAX data or query parameters."
            ),
            "landing_step_2_title": "Service request",
            "landing_step_2_text": "Choose the needed tool and submit data in the web cabinet.",
            "landing_step_3_title": "Result and history",
            "landing_step_3_text": (
                "The service returns results, updates balance, and stores request/report history."
            ),
            "landing_about_title": "Why it is convenient",
            "landing_benefit_one_title": "One cabinet",
            "landing_benefit_one_text": (
                "All functionality in one interface without switching between different bots."
            ),
            "landing_benefit_two_title": "Transparent balance",
            "landing_benefit_two_text": (
                "You always see current balance and deductions for each module before requests."
            ),
            "landing_meta_platform_label": "Platform",
            "landing_meta_user_label": "User",
            "landing_meta_user_recognized": "User recognized",
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
        "tarot": "Астрология",
        "natal_maps": "Астрология",
        "tarot_cards": "Таро",
        "astrology": "Астропрогноз",
        "topup": "Пополнение",
        "home": "На главную",
        "dream_description": "Описание сна",
        "get_interpretation": "Получить интерпретацию",
        "cost_label": "Стоимость",
        "sign_in_required_title": "Войдите, чтобы продолжить",
        "sign_in_required_text": "Создайте аккаунт или войдите, чтобы пользоваться инструментом и сохранять результаты в истории.",
        "sign_in_required_action": "Войти",
        "full_name": "Полное имя",
        "birth_date": "Дата рождения (ДД.ММ.ГГГГ)",
        "generate_pdf": "Сгенерировать PDF",
        "by_names": "По именам",
        "by_names_dates": "По именам и датам",
        "tarot_question": "Дополнительный контекст",
        "tarot_spread": "Расклад",
        "tarot_spread_three_cards": "Три карты",
        "tarot_spread_choice": "Выбор",
        "tarot_spread_relationship": "Отношения",
        "tarot_cards_question": "Вопрос или ситуация",
        "tarot_cards_choose_hint": "Колода вытягивает три карты. Форма вопроса появится после того, как карты лягут на стол.",
        "tarot_cards_selected": "Выбранные карты",
        "get_tarot_cards_reading": "Получить гадание Таро",
        "get_tarot_reading": "Получить натальную карту",
        "open_natal_map_form": "Открыть форму натальной карты",
        "persona_required_error": "Выберите сохранённую персону или введите минимум имя и дату рождения.",
        "personas": "Персоны",
        "my_personas": "Мои персоны",
        "persona_use_saved": "Выбрать",
        "persona_manual": "Ввести",
        "persona_save_offer": "Сохранить эту персону для следующих разборов",
        "persona_save": "Сохранить персону",
        "persona_add": "Добавить персону",
        "persona_update": "Обновить персону",
        "persona_delete": "Удалить",
        "persona_empty": "Сохранённых персон пока нет",
        "persona_name": "Имя персоны",
        "persona_note": "Заметка",
        "persona_saved": "Персона сохранена",
        "persona_deleted": "Персона удалена",
        "persona_select_placeholder": "Выберите персону",
        "back_to_natal_maps": "Назад к Астрологии",
        "astrology_name": "Имя",
        "astrology_birth_time": "Время рождения (необязательно)",
        "astrology_birth_place": "Место рождения (необязательно)",
        "astrology_focus": "Вопрос или фокус",
        "get_astrology_forecast": "Получить прогноз",
        "name_1": "Имя 1",
        "name_2": "Имя 2",
        "date_1": "Дата 1 (ДД.ММ.ГГГГ)",
        "date_2": "Дата 2 (ДД.ММ.ГГГГ)",
        "calc_compatibility": "Рассчитать совместимость",
        "yookassa_payment": "Оплата YooKassa",
        "spark_package": "Пакет искр",
        "create_payment": "Создать платеж",
        "check_payment": "Проверить оплату",
        "receipt_email": "Email для чека",
        "public_offer_ack_prefix": "Я ознакомился с условиями",
        "public_offer_ack_link": "публичной оферты",
        "soon": "Скоро",
        "sparks": "Искры",
        "email_auth": "Авторизация по email",
        "register": "Регистрация",
        "login": "Вход",
        "email": "Email",
        "password": "Пароль",
        "repeat_password": "Повтор пароля",
        "verification_code": "Код из письма",
        "send_code": "Отправить код",
        "confirm_registration": "Подтвердить регистрацию",
        "password_reset": "Смена пароля",
        "code_sent": "Код отправлен на почту",
        "auth_cell_open": "Войти по email",
        "have_account": "Уже есть аккаунт?",
        "no_account": "Нет аккаунта?",
        "go_to_login": "Войти",
        "go_to_register": "Регистрация",
        "verify_registration": "Подтверждение регистрации",
        "back": "Назад",
        "close": "Закрыть",
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
        "logout": "Выйти",
        "admin_users": "Пользователи",
        "admin_find_user": "Найти",
        "admin_user_lookup": "ID или email",
        "admin_sparks_amount": "Искры (+ начислить / − списать)",
        "admin_sparks_reason": "Причина",
        "admin_apply_credits": "Применить",
        "admin_user_not_found": "Пользователь не найден",
        "mobile_hero_description": "Сервис личных инсайтов",
        "feature_sonnik_desc": "Разбор снов с помощью AI-интерпретации символов и контекста.",
        "feature_numerology_desc": "Персональный разбор по ФИО и дате рождения.",
        "feature_compatibility_desc": "Анализ отношений и совместимости в двух режимах.",
        "feature_tarot_desc": "Персональная астрология про деньги, любовь, карьеру, сильные качества и жизненные сценарии.",
        "feature_tarot_cards_desc": "Классическое гадание по картам Таро с раскладами и символическими подсказками.",
        "feature_astrology_desc": "Персональный астропрогноз по дате, месту и текущему фокусу.",
        "feature_lunar_desc": "Лунный календарь скоро будет доступен.",
        "landing_title": "Astrolhub - Сонник, Нумерология, Совместимость",
        "landing_nav_features": "Возможности",
        "landing_nav_how": "Как это работает",
        "landing_nav_about": "О сервисе",
        "landing_open_web_cabinet": "Открыть веб-кабинет",
        "landing_eyebrow": "AI-сервисы для личных инсайтов",
        "landing_h1": "Сонник, нумерология и совместимость в одном цифровом пространстве",
        "landing_guest_text": "Откройте веб-сервис в браузере или зайдите через Telegram-бот.",
        "landing_open_tg_bot": "Перейти в Telegram-бот",
        "landing_recognized_text": (
            "Пользователь распознан. Откройте рабочий кабинет и используйте полный набор "
            "инструментов: интерпретацию снов, генерацию нумерологического PDF и анализ совместимости."
        ),
        "landing_open_full": "Открыть полный функционал",
        "landing_recognized_meta_default": "Вы вошли через внешний канал",
        "landing_available_title": "Что доступно",
        "landing_available_1": "Сонник с AI-интерпретацией",
        "landing_available_2": "Нумерологический PDF-отчет",
        "landing_available_3": "Анализ совместимости (2 режима)",
        "landing_features_title": "Функционал",
        "landing_features_subtitle": (
            "Каждый инструмент закрывает отдельный сценарий: быстрый ответ, глубокий разбор "
            "или сравнительный анализ."
        ),
        "landing_feature_dream_title": "Сонник",
        "landing_feature_dream_text": (
            "Опишите сон свободным текстом и получите осмысленную AI-интерпретацию "
            "с акцентом на символы и контекст."
        ),
        "landing_feature_numerology_title": "Нумерология",
        "landing_feature_numerology_text": (
            "По ФИО и дате рождения формируется персональный PDF-отчет, который можно "
            "сохранить и пересматривать."
        ),
        "landing_feature_compatibility_title": "Совместимость",
        "landing_feature_compatibility_text": (
            "Два режима анализа: по именам или по именам+датам рождения для более "
            "детального и точного результата."
        ),
        "landing_how_title": "Как это работает",
        "landing_step_1_title": "Распознавание",
        "landing_step_1_text": (
            "Платформа определяет контекст входа по данным Telegram/MAX или query-параметрам."
        ),
        "landing_step_2_title": "Запрос в сервис",
        "landing_step_2_text": "Вы выбираете нужный инструмент и отправляете данные в веб-кабинете.",
        "landing_step_3_title": "Результат и история",
        "landing_step_3_text": (
            "Сервис возвращает результат, обновляет баланс и сохраняет историю запросов и отчеты."
        ),
        "landing_about_title": "Почему это удобно",
        "landing_benefit_one_title": "Один кабинет",
        "landing_benefit_one_text": "Весь функционал в одном интерфейсе без переключений между разными ботами.",
        "landing_benefit_two_title": "Прозрачный баланс",
        "landing_benefit_two_text": (
            "Перед каждым запросом видно текущее состояние и списания по каждому модулю."
        ),
        "landing_meta_platform_label": "Платформа",
        "landing_meta_user_label": "Пользователь",
        "landing_meta_user_recognized": "Пользователь распознан",
    }


def _card_reading_topics(lang: str) -> list[dict[str, str | bool]]:
    page_lang = _normalize_lang(lang)
    icon_map = {
        "money": "money.svg",
        "career": "career.svg",
        "love": "love.svg",
        "attraction": "attraction.svg",
        "hidden_scenarios": "hidden-scenarios.svg",
        "energy": "energy.svg",
        "period_task": "period-task.svg",
        "child_potential": "child-potential.svg",
        "strengths": "strengths.svg",
        "decisions": "decisions.svg",
        "full_portrait": "full-portrait.svg",
    }
    return [
        {
            "key": key,
            "title": value[page_lang]["title"],
            "description": value[page_lang]["description"],
            "icon": f"/static/img/card-readings/{icon_map[key]}",
            "wide": key == "full_portrait",
        }
        for key, value in divination.CARD_READING_TOPICS.items()
    ]


def _card_reading_topic_context(topic: str, lang: str) -> dict[str, str | bool]:
    page_lang = _normalize_lang(lang)
    topic_key = _validate_card_reading_topic(topic)
    topic_map = {item["key"]: item for item in _card_reading_topics(page_lang)}
    return topic_map[topic_key]


def _is_recognized_request(request: Request, name: str = "", platform: str = "") -> bool:
    if name.strip() or platform.strip():
        return True
    if request.headers.get("X-Telegram-Init-Data"):
        return True
    if request.headers.get("X-Max-User-Id"):
        return True
    return False


def _client_url_with_query(name: str = "", platform: str = "", lang: str = "") -> str:
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
    lang: str = Query(default=""),
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
            "telegram_bot_url": _landing_telegram_bot_url(page_lang),
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


@app.get("/public-offer.pdf", include_in_schema=False)
async def public_offer_pdf():
    offer_file = next((path for path in PUBLIC_OFFER_FILE_CANDIDATES if path.exists()), None)
    if not offer_file:
        raise HTTPException(status_code=404, detail="Public offer file not found")
    return FileResponse(path=offer_file, media_type="application/pdf", filename="Публичная оферта.pdf")


def _client_template_context(request: Request, lang: str, selected_card_topic: str = "") -> dict:
    page_lang = _normalize_lang(lang)
    initial_auth_username = _translations(page_lang)["guest"]
    initial_auth_provider = _translations(page_lang)["guest"]
    selected_topic = _card_reading_topic_context(selected_card_topic, page_lang) if selected_card_topic else None
    return {
        "request": request,
        "brand_name": "Astrolhub",
        "dev_auth_bypass": settings.dev_auth_bypass,
        "dev_auth_mock_username": settings.dev_auth_mock_username,
        "lang": page_lang,
        "t": _translations(page_lang),
        "initial_auth_username": initial_auth_username,
        "initial_auth_provider": initial_auth_provider,
        "email_skip_verification": settings.email_skip_verification,
        "hide_topup_button": settings.hide_topup_button,
        "cost_sonnik": settings.cost_sonnik,
        "cost_numerology": settings.cost_numerology,
        "cost_sovmestimost": settings.cost_sovmestimost,
        "cost_tarot": settings.cost_tarot,
        "cost_tarot_cards": settings.cost_tarot_cards,
        "cost_astrology": settings.cost_astrology,
        "card_reading_topics": _card_reading_topics(page_lang),
        "card_reading_default_topic": divination.CARD_READING_TOPICS["full_portrait"][page_lang],
        "selected_card_reading_topic": selected_topic,
    }


@app.get("/client", response_class=HTMLResponse, include_in_schema=False)
async def client_dashboard(request: Request, lang: str = Query(default="")):
    return templates.TemplateResponse(
        request=request,
        name="client_dashboard.html",
        context=_client_template_context(request, lang),
    )


def _render_client_register(request: Request, lang: str):
    return templates.TemplateResponse(
        request=request,
        name="client_register.html",
        context=_client_template_context(request, lang),
    )


def _render_client_login(request: Request, lang: str):
    return templates.TemplateResponse(
        request=request,
        name="client_login.html",
        context=_client_template_context(request, lang),
    )


@app.get("/client/register", response_class=HTMLResponse, include_in_schema=False)
@app.get("/client/sign-up", response_class=HTMLResponse, include_in_schema=False)
async def client_register(request: Request, lang: str = Query(default="")):
    return _render_client_register(request, lang)


@app.get("/client/register/verify", response_class=HTMLResponse, include_in_schema=False)
async def client_register_verify(
    request: Request,
    lang: str = Query(default=""),
    email: str = Query(default=""),
):
    page_lang = _normalize_lang(lang)
    normalized = ""
    try:
        normalized = normalize_email(email)
    except HTTPException:
        return RedirectResponse(url=f"/client/register?lang={page_lang}", status_code=302)
    if settings.email_skip_verification or not has_pending_registration(normalized):
        return RedirectResponse(url=f"/client/register?lang={page_lang}", status_code=302)
    context = _client_template_context(request, page_lang)
    context["register_email"] = normalized
    return templates.TemplateResponse(
        request=request,
        name="client_register_verify.html",
        context=context,
    )


@app.get("/client/login", response_class=HTMLResponse, include_in_schema=False)
@app.get("/client/sign-in", response_class=HTMLResponse, include_in_schema=False)
async def client_login(request: Request, lang: str = Query(default="")):
    return _render_client_login(request, lang)


@app.get("/client/sonnik", response_class=HTMLResponse, include_in_schema=False)
async def client_sonnik(request: Request, lang: str = Query(default="")):
    return templates.TemplateResponse(
        request=request,
        name="client_sonnik.html",
        context=_client_template_context(request, lang),
    )


@app.get("/client/numerology", response_class=HTMLResponse, include_in_schema=False)
async def client_numerology(request: Request, lang: str = Query(default="")):
    return templates.TemplateResponse(
        request=request,
        name="client_numerology.html",
        context=_client_template_context(request, lang),
    )


@app.get("/client/compatibility", response_class=HTMLResponse, include_in_schema=False)
async def client_compatibility(request: Request, lang: str = Query(default="")):
    return templates.TemplateResponse(
        request=request,
        name="client_compatibility.html",
        context=_client_template_context(request, lang),
    )


@app.get("/client/tarot", response_class=HTMLResponse, include_in_schema=False)
async def client_tarot(request: Request, lang: str = Query(default="")):
    return templates.TemplateResponse(
        request=request,
        name="client_tarot.html",
        context=_client_template_context(request, lang),
    )


@app.get("/client/tarot/{topic}", response_class=HTMLResponse, include_in_schema=False)
async def client_tarot_topic(request: Request, topic: str, lang: str = Query(default="")):
    page_lang = _normalize_lang(lang)
    return templates.TemplateResponse(
        request=request,
        name="client_tarot.html",
        context=_client_template_context(request, page_lang, selected_card_topic=topic),
    )


@app.get("/client/tarot-cards", response_class=HTMLResponse, include_in_schema=False)
async def client_tarot_cards(request: Request, lang: str = Query(default="")):
    return templates.TemplateResponse(
        request=request,
        name="client_tarot_cards.html",
        context=_client_template_context(request, lang),
    )


@app.get("/client/astrology", response_class=HTMLResponse, include_in_schema=False)
async def client_astrology(request: Request, lang: str = Query(default="")):
    return templates.TemplateResponse(
        request=request,
        name="client_astrology.html",
        context=_client_template_context(request, lang),
    )


@app.get("/client/history", response_class=HTMLResponse, include_in_schema=False)
async def client_history(request: Request, lang: str = Query(default="")):
    return templates.TemplateResponse(
        request=request,
        name="client_history.html",
        context=_client_template_context(request, lang),
    )


@app.get("/client/topup", response_class=HTMLResponse, include_in_schema=False)
async def client_topup(request: Request, lang: str = Query(default="")):
    return templates.TemplateResponse(
        request=request,
        name="client_topup.html",
        context=_client_template_context(request, lang),
    )


@app.get("/client/profile", response_class=HTMLResponse, include_in_schema=False)
async def client_profile(
    request: Request,
    lang: str = Query(default=""),
    auth: str = Query(default=""),
):
    auth_mode = (auth or "").strip().lower()
    if auth_mode == "login":
        return _render_client_login(request, lang)
    if auth_mode in {"register", "signup"}:
        return _render_client_register(request, lang)
    return templates.TemplateResponse(
        request=request,
        name="client_profile.html",
        context=_client_template_context(request, lang),
    )


@app.get("/client/support", response_class=HTMLResponse, include_in_schema=False)
async def client_support(request: Request, lang: str = Query(default="")):
    return templates.TemplateResponse(
        request=request,
        name="client_support.html",
        context=_client_template_context(request, lang),
    )


@app.get("/client/lunar", include_in_schema=False)
async def client_lunar(lang: str = Query(default="")):
    return RedirectResponse(url=f"/client?lang={lang}", status_code=302)


@app.get("/client/numerology/report/{report_id}", response_class=HTMLResponse, include_in_schema=False)
async def client_numerology_report(
    report_id: int,
    request: Request,
    lang: str = Query(default=""),
):
    return templates.TemplateResponse(
        request=request,
        name="client_numerology_report.html",
        context={**_client_template_context(request, lang), "report_id": report_id},
    )


@app.get("/admin", response_class=HTMLResponse, include_in_schema=False)
async def admin_dashboard(
    request: Request,
    lang: str = Query(default=""),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    try:
        _require_admin_email_user(email_identity)
    except HTTPException as exc:
        page_lang = _normalize_lang(lang)
        if exc.status_code == 401:
            return RedirectResponse(url=f"/static/auth/login.html?lang={page_lang}&next=/admin%3Flang%3D{page_lang}", status_code=302)
        raise
    return templates.TemplateResponse(
        request=request,
        name="admin_dashboard.html",
        context=_client_template_context(request, lang),
    )


@app.get("/health")
async def health() -> dict[str, str | bool]:
    return {
        "status": "ok",
        "build": API_BUILD_ID,
        "email_auth": True,
        "email_skip_verification": settings.email_skip_verification,
    }


@app.get("/mini-app")
async def mini_app(
    request: Request,
    name: str = Query(default=""),
    platform: str = Query(default=""),
    lang: str = Query(default=""),
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


@app.get("/api/auth/telegram/health")
async def telegram_auth_health():
    from app.web.auth.telegram_auth import telegram_auth_health as _health

    return _health()


@app.get("/api/auth/telegram/bot-fingerprint")
async def telegram_bot_fingerprint():
    import hashlib

    from app.web.auth.telegram_auth import _bot_tokens

    tokens = _bot_tokens()
    return {
        "configured": len(tokens) > 0,
        "fingerprints": [
            {"index": index, "fingerprint": hashlib.sha256(token.encode("utf-8")).hexdigest()[:16]}
            for index, token in enumerate(tokens)
        ],
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
    _set_telegram_auth_cookie(response, token)
    return response


@app.post("/api/auth/telegram/mint-username-link")
async def mint_telegram_username_link(
    payload: TelegramMintUsernameLinkRequest,
    authorization: str | None = Header(default=None),
):
    """
    Build a one-time style login URL for a Telegram user already stored with this @username.
    Requires Authorization: Bearer <TELEGRAM_BOT_TOKEN> (same as the main bot).
    """
    verify_telegram_bot_bearer(authorization)
    row = db.get_telegram_user_by_username_ci(payload.username)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    uname = (row["username"] or "").strip().lstrip("@") or payload.username.strip().lstrip("@")
    return {
        "success": True,
        "url": issue_telegram_username_login_url(uname),
    }


@app.post("/api/auth/telegram/verify-link")
async def verify_telegram_username_link_post(payload: TelegramLinkVerifyRequest):
    """
    Exchange a signed tglink=… token (see issue_telegram_username_login_url) for a session.
    The user must already exist with provider=telegram and matching username in the database
    (typically after a prior Mini App login that stored their @username).
    """
    identity = resolve_telegram_username_link_to_identity(payload.link_token)
    session_token = issue_telegram_auth_token(identity)
    response_data = {
        "success": True,
        "token": session_token,
        "profile": {
            "provider": "telegram",
            "provider_user_id": identity.user_id,
            "username": identity.username,
            "language": identity.language,
        },
        "balance": get_balance(identity.internal_user_id),
    }
    response = JSONResponse(content=response_data)
    _set_telegram_auth_cookie(response, session_token)
    return response


API_BUILD_ID = "78fdf5a-admin-list-v1"


@app.get("/api/health")
async def api_health():
    return {
        "ok": True,
        "build": API_BUILD_ID,
        "email_auth": True,
    }


@app.get("/api/auth/email/health")
async def api_email_health():
    return {
        "build": API_BUILD_ID,
        "smtp_configured": bool(settings.smtp_host and settings.smtp_from),
        "smtp_host_set": bool(settings.smtp_host),
        "smtp_from_set": bool(settings.smtp_from),
        "smtp_user_set": bool(settings.smtp_user),
        "smtp_port": settings.smtp_port,
        "smtp_use_tls": settings.smtp_use_tls,
        "smtp_use_ssl": settings.smtp_use_ssl,
        "email_skip_verification": settings.email_skip_verification,
    }


@app.post("/api/auth/email/register")
@app.post("/api/auth/email/register/start")
async def api_email_register_start(payload: EmailRegisterStartRequest):
    lang = _normalize_lang(payload.language)
    if settings.email_skip_verification:
        identity, is_new_user = await run_in_threadpool(
            complete_email_registration,
            payload.email,
            payload.password,
            payload.password_confirm,
            lang,
        )
        if is_new_user:
            record_transaction(
                identity.internal_user_id,
                settings.starting_credits,
                "signup_bonus",
                "email_welcome_bonus",
                {"provider": "email"},
            )
        return _email_auth_response(identity, is_new_user=is_new_user)
    return await run_in_threadpool(
        start_email_registration,
        payload.email,
        payload.password,
        payload.password_confirm,
        lang,
    )


@app.post("/api/auth/email/register/resend")
async def api_email_register_resend(payload: EmailResendRequest):
    lang = _normalize_lang(payload.language)
    return await run_in_threadpool(resend_registration_code, payload.email, lang)


@app.post("/api/auth/email/register/verify")
async def api_email_register_verify(payload: EmailRegisterVerifyRequest):
    identity, is_new_user = await run_in_threadpool(
        verify_email_registration,
        payload.email,
        payload.code,
        _normalize_lang(payload.language),
    )
    if is_new_user:
        record_transaction(
            identity.internal_user_id,
            settings.starting_credits,
            "signup_bonus",
            "email_welcome_bonus",
            {"provider": "email"},
        )
    return _email_auth_response(identity, is_new_user=is_new_user)


@app.post("/api/auth/email/login")
async def api_email_login(payload: EmailLoginRequest):
    identity = await run_in_threadpool(login_email_user, payload.email, payload.password)
    return _email_auth_response(identity)


@app.post("/api/auth/logout")
async def api_logout():
    response = JSONResponse(content={"success": True})
    _clear_auth_cookies(response)
    return response


@app.post("/api/auth/email/password-reset/request")
async def api_email_password_reset_request(
    email_identity: EmailIdentity = Depends(optional_email_auth),
):
    if not email_identity:
        raise HTTPException(status_code=401, detail="Email authentication is required")
    lang = email_identity.language
    return await run_in_threadpool(request_password_reset, email_identity, lang)


@app.post("/api/auth/email/password-reset/confirm")
async def api_email_password_reset_confirm(
    payload: EmailPasswordResetConfirmRequest,
    email_identity: EmailIdentity = Depends(optional_email_auth),
):
    if not email_identity:
        raise HTTPException(status_code=401, detail="Email authentication is required")
    identity = await run_in_threadpool(
        confirm_password_reset,
        email_identity,
        payload.code,
        payload.new_password,
        payload.password_confirm,
    )
    return {"success": True, "message": "Password updated", "profile": {
        "provider": "email",
        "provider_user_id": identity.user_id,
        "username": identity.username,
        "language": identity.language,
    }}


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


@app.get("/api/personas")
async def api_list_personas(
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    return {"success": True, "personas": [_serialize_persona(row) for row in db.list_personas(user_id)]}


@app.post("/api/personas")
async def api_create_persona(
    payload: PersonaCreateRequest,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    data = _clean_persona_payload(payload)
    row = db.create_persona(user_id=user_id, **data)
    return {"success": True, "persona": _serialize_persona(row)}


@app.patch("/api/personas/{persona_id}")
async def api_update_persona(
    persona_id: int,
    payload: PersonaUpdateRequest,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    data = _clean_persona_payload(payload)
    row = db.update_persona(user_id=user_id, persona_id=persona_id, **data)
    if not row:
        raise HTTPException(status_code=404, detail="Persona not found")
    return {"success": True, "persona": _serialize_persona(row)}


@app.delete("/api/personas/{persona_id}")
async def api_delete_persona(
    persona_id: int,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    if not db.delete_persona(user_id=user_id, persona_id=persona_id):
        raise HTTPException(status_code=404, detail="Persona not found")
    return {"success": True}


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


def _require_authenticated_user(
    max_identity: MaxIdentity | None,
    telegram_identity: TelegramIdentity | None,
    email_identity: EmailIdentity | None = None,
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


def _admin_date_range(date_from: str = "", date_to: str = "", days: int = 30) -> tuple[str, str]:
    today = date.today()
    end = today
    start = today - timedelta(days=max(days - 1, 0))
    if date_to:
        try:
            end = date.fromisoformat(date_to[:10])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid date_to") from exc
    if date_from:
        try:
            start = date.fromisoformat(date_from[:10])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid date_from") from exc
    if start > end:
        raise HTTPException(status_code=400, detail="date_from must be before date_to")
    return start.isoformat(), end.isoformat()


def _record_admin_audit(admin_user_id: int, action: str, target_user_id: int | None = None, metadata: dict | None = None) -> None:
    db.record_admin_audit(admin_user_id=admin_user_id, action=action, target_user_id=target_user_id, metadata=metadata or {})


@app.get("/api/payments/packages")
async def payment_packages():
    return {"success": True, "packages": payments.get_payment_packages()}


@app.post("/api/payments/yookassa/create")
async def api_create_yookassa_payment(
    payload: YooKassaCreatePaymentRequest,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    result = await run_in_threadpool(payments.create_payment, user_id, payload.package_id, payload.receipt_email)
    return {"success": True, **result, "balance": get_balance(user_id)}


@app.post("/api/payments/yookassa/{payment_id}/check")
async def api_check_yookassa_payment(
    payment_id: str,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    result = await run_in_threadpool(payments.check_payment, payment_id, user_id)
    return {"success": True, **result}


@app.get("/api/payments/yookassa/history")
async def api_payments_history(
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    result = await run_in_threadpool(payments.list_user_payments, user_id)
    return {"success": True, "payments": result, "balance": get_balance(user_id)}


@app.post("/api/payments/yookassa/{payment_id}/cancel")
async def api_cancel_yookassa_payment(
    payment_id: str,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    result = await run_in_threadpool(payments.cancel_payment, payment_id, user_id)
    return {"success": True, **result}


@app.post("/api/payments/yookassa/sync-pending")
async def api_sync_pending_yookassa_payments(
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    synced = await run_in_threadpool(payments.sync_pending_payments, user_id)
    return {"success": True, "synced": synced, "balance": get_balance(user_id)}


@app.get("/api/admin/stats/overview")
async def api_admin_stats_overview(
    date_from: str = Query(default="", alias="from"),
    date_to: str = Query(default="", alias="to"),
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    _admin_user_id = _require_admin_email_user(email_identity)
    start, end = _admin_date_range(date_from, date_to)
    return {"success": True, "from": start, "to": end, **db.get_admin_overview_stats(start, end)}


@app.get("/api/admin/me")
async def api_admin_me(
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    if not email_identity:
        return {"is_admin": False}
    return {"is_admin": db.is_user_admin(email_identity.internal_user_id)}


@app.get("/api/admin/users/search")
async def api_admin_users_search(
    q: str = Query(default="", max_length=200),
    provider: str = Query(default="", max_length=32),
    role: str = Query(default="", max_length=16),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    admin_user_id = _require_admin_email_user(email_identity)
    _record_admin_audit(
        admin_user_id,
        "search_users",
        metadata={"query": q.strip(), "provider": provider.strip(), "role": role.strip(), "limit": limit, "offset": offset},
    )
    rows = await run_in_threadpool(db.search_users, q.strip(), limit, offset, provider.strip(), role.strip())
    users = [
        {
            "id": int(row["id"]),
            "provider": row["provider"],
            "provider_user_id": row["provider_user_id"],
            "username": row["username"],
            "credits": int(row["credits"]),
            "role": row["role"] or "user",
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
        for row in rows
    ]
    return {"success": True, "users": users}


@app.post("/api/admin/users/adjust-credits")
async def api_admin_adjust_credits(
    payload: AdminAdjustCreditsRequest,
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    admin_user_id = _require_admin_email_user(email_identity)
    max_adjustment = max(settings.admin_max_credit_adjustment, 1)
    if abs(payload.amount) > max_adjustment:
        raise HTTPException(status_code=400, detail=f"Amount exceeds admin limit ({max_adjustment})")
    reason = payload.reason.strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Reason is required")
    metadata = {"admin_user_id": admin_user_id, "reason": reason}
    if payload.amount > 0:
        new_balance = await run_in_threadpool(
            credit,
            payload.user_id,
            payload.amount,
            reason,
            metadata,
            "admin_credit",
        )
    elif payload.amount < 0:
        new_balance = await run_in_threadpool(
            admin_debit,
            payload.user_id,
            abs(payload.amount),
            reason,
            metadata,
        )
    else:
        new_balance = await run_in_threadpool(get_balance, payload.user_id)
    _record_admin_audit(
        admin_user_id,
        "adjust_credits",
        payload.user_id,
        {"amount": payload.amount, "new_balance": new_balance, "reason": reason},
    )
    user = db.get_user_by_id(payload.user_id)
    return {
        "success": True,
        "user_id": payload.user_id,
        "balance": new_balance,
        "username": user["username"] if user else "",
        "provider": user["provider"] if user else "",
    }


@app.get("/api/admin/stats/modules")
async def api_admin_stats_modules(
    date_from: str = Query(default="", alias="from"),
    date_to: str = Query(default="", alias="to"),
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    _admin_user_id = _require_admin_email_user(email_identity)
    start, end = _admin_date_range(date_from, date_to)
    return {"success": True, "from": start, "to": end, "modules": [dict(row) for row in db.get_admin_module_stats(start, end)]}


@app.get("/api/admin/stats/daily")
async def api_admin_stats_daily(
    date_from: str = Query(default="", alias="from"),
    date_to: str = Query(default="", alias="to"),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    _require_admin_email_user(email_identity)
    start, end = _admin_date_range(date_from, date_to)
    return {"success": True, "from": start, "to": end, "days": [dict(row) for row in db.get_admin_daily_stats(start, end)]}


@app.get("/api/admin/stats/payments")
async def api_admin_stats_payments(
    date_from: str = Query(default="", alias="from"),
    date_to: str = Query(default="", alias="to"),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    _require_admin_email_user(email_identity)
    start, end = _admin_date_range(date_from, date_to)
    return {"success": True, "from": start, "to": end, "payments": [dict(row) for row in db.get_admin_payment_stats(start, end)]}


@app.get("/api/admin/stats/sparks")
async def api_admin_stats_sparks(
    date_from: str = Query(default="", alias="from"),
    date_to: str = Query(default="", alias="to"),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    _require_admin_email_user(email_identity)
    start, end = _admin_date_range(date_from, date_to)
    return {"success": True, "from": start, "to": end, "sparks": [dict(row) for row in db.get_admin_spark_stats(start, end)]}


@app.get("/api/admin/stats/providers")
async def api_admin_stats_providers(
    date_from: str = Query(default="", alias="from"),
    date_to: str = Query(default="", alias="to"),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    _require_admin_email_user(email_identity)
    start, end = _admin_date_range(date_from, date_to)
    return {"success": True, "from": start, "to": end, "providers": [dict(row) for row in db.get_admin_provider_stats(start, end)]}


@app.get("/api/admin/stats/top-users")
async def api_admin_stats_top_users(
    date_from: str = Query(default="", alias="from"),
    date_to: str = Query(default="", alias="to"),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    _require_admin_email_user(email_identity)
    start, end = _admin_date_range(date_from, date_to)
    return {"success": True, "from": start, "to": end, "users": [dict(row) for row in db.get_admin_top_users(start, end)]}


@app.get("/api/admin/users/{user_id}")
async def api_admin_user_detail(
    user_id: int,
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    admin_user_id = _require_admin_email_user(email_identity)
    row = db.get_admin_user_detail(user_id)
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    _record_admin_audit(admin_user_id, "view_user", user_id)
    return {"success": True, "user": dict(row), "personas": [_serialize_persona(persona) for persona in db.list_personas(user_id)]}


@app.get("/api/admin/users/{user_id}/history")
async def api_admin_user_history(
    user_id: int,
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    admin_user_id = _require_admin_email_user(email_identity)
    _record_admin_audit(admin_user_id, "view_user_history", user_id)
    return {"success": True, "items": [dict(row) for row in db.list_request_history(user_id=user_id, limit=50)]}


@app.get("/api/admin/users/{user_id}/transactions")
async def api_admin_user_transactions(
    user_id: int,
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    admin_user_id = _require_admin_email_user(email_identity)
    _record_admin_audit(admin_user_id, "view_user_transactions", user_id)
    return {"success": True, "transactions": [dict(row) for row in db.list_transactions_for_user(user_id=user_id, limit=50)]}


@app.get("/api/admin/users/{user_id}/payments")
async def api_admin_user_payments(
    user_id: int,
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    admin_user_id = _require_admin_email_user(email_identity)
    _record_admin_audit(admin_user_id, "view_user_payments", user_id)
    return {"success": True, "payments": [dict(row) for row in db.list_payments_for_user_admin(user_id=user_id, limit=50)]}


@app.patch("/api/admin/users/{user_id}/role")
async def api_admin_set_role(
    user_id: int,
    payload: AdminSetRoleRequest,
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    admin_user_id = _require_admin_email_user(email_identity)
    user = db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    current_role = user["role"] or "user"
    new_role = payload.role.strip()
    try:
        db.update_user_role_safely(user_id, new_role)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail="Cannot remove the last admin")
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="User not found") from exc
    _record_admin_audit(admin_user_id, "set_role", user_id, {"old_role": current_role, "new_role": new_role})
    return {"success": True, "user_id": user_id, "role": new_role}


@app.get("/api/admin/support/tickets")
async def api_admin_support_tickets(
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
    status: str = Query(default=""),
):
    admin_user_id = _require_admin_email_user(email_identity)
    _record_admin_audit(admin_user_id, "list_support_tickets", metadata={"status": status.strip()})
    rows = db.list_support_tickets_admin(status=status.strip() or None)
    return {"success": True, "tickets": [dict(row) for row in rows]}


@app.get("/api/admin/support/tickets/{ticket_id}")
async def api_admin_support_ticket_details(
    ticket_id: int,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    admin_user_id = _require_admin_email_user(email_identity)
    ticket = db.get_support_ticket(ticket_id=ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    _record_admin_audit(admin_user_id, "view_support_ticket", ticket["user_id"], {"ticket_id": ticket_id})
    messages = db.list_support_messages(ticket_id=ticket_id)
    return {"success": True, "ticket": dict(ticket), "messages": [dict(row) for row in messages]}


@app.post("/api/admin/support/tickets/{ticket_id}/messages")
async def api_admin_support_ticket_reply(
    ticket_id: int,
    payload: AdminSupportReplyRequest,
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    admin_user_id = _require_admin_email_user(email_identity)
    ticket = db.get_support_ticket(ticket_id=ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    db.add_support_message(ticket_id=ticket_id, author_user_id=admin_user_id, message_text=payload.message_text.strip())
    _record_admin_audit(admin_user_id, "support_reply", ticket["user_id"], {"ticket_id": ticket_id})
    messages = db.list_support_messages(ticket_id=ticket_id)
    return {"success": True, "messages": [dict(row) for row in messages]}


@app.patch("/api/admin/support/tickets/{ticket_id}")
async def api_admin_support_ticket_status(
    ticket_id: int,
    payload: AdminTicketStatusRequest,
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    admin_user_id = _require_admin_email_user(email_identity)
    ticket = db.get_support_ticket(ticket_id=ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if not db.update_support_ticket_status(ticket_id=ticket_id, status=payload.status):
        raise HTTPException(status_code=404, detail="Ticket not found")
    _record_admin_audit(admin_user_id, "support_status", ticket["user_id"], {"ticket_id": ticket_id, "status": payload.status})
    return {"success": True, "ticket_id": ticket_id, "status": payload.status}


@app.get("/api/admin/audit-log")
async def api_admin_audit_log(
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    _require_admin_email_user(email_identity)
    return {"success": True, "items": [dict(row) for row in db.list_admin_audit_log(limit=limit, offset=offset)]}


@app.post("/api/sonnik/interpret")
async def api_sonnik(
    payload: SonnikRequest,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    requested_language = _normalize_lang(payload.language or _resolve_language(email_identity, max_identity, telegram_identity))
    charge(user_id, settings.cost_sonnik, "sonnik", {"module": "sonnik"})
    try:
        interpretation = sonnik.interpret_dream(payload.dream_text, requested_language)
    except HTTPException as exc:
        new_balance = refund(user_id, settings.cost_sonnik, "sonnik_refund", {"module": "sonnik"})
        return JSONResponse(status_code=exc.status_code, content={"error": _public_error_detail(exc, "sonnik", requested_language), "balance": new_balance})
    except Exception as exc:
        new_balance = refund(user_id, settings.cost_sonnik, "sonnik_refund", {"module": "sonnik"})
        return JSONResponse(status_code=502, content={"error": _service_failure_message("sonnik", requested_language), "balance": new_balance})

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
    requested_language = _normalize_lang(payload.language or _resolve_language(email_identity, max_identity, telegram_identity))
    charge(user_id, settings.cost_numerology, "numerology", {"module": "numerology"})
    try:
        report_payload = numerology.generate_web_report(payload.full_name, payload.birth_date, requested_language)
    except HTTPException as exc:
        new_balance = refund(user_id, settings.cost_numerology, "numerology_refund", {"module": "numerology"})
        return JSONResponse(status_code=exc.status_code, content={"error": _public_error_detail(exc, "numerology", requested_language), "balance": new_balance})
    except Exception as exc:
        new_balance = refund(user_id, settings.cost_numerology, "numerology_refund", {"module": "numerology"})
        return JSONResponse(status_code=500, content={"error": _service_failure_message("numerology", requested_language), "balance": new_balance})

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
    lang: str = Query(default=""),
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    row = db.get_html_report(report_id=report_id, user_id=user_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    content = json.loads(row["content_json"] or "{}")
    requested_language = _normalize_lang(lang or _resolve_language(email_identity, max_identity, telegram_identity))
    if requested_language == "en" and str(content.get("language", "")).strip().lower() != "en":
        content = numerology.translate_report_payload(content, "en")
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
    requested_language = _normalize_lang(payload.language or _resolve_language(email_identity, max_identity, telegram_identity))
    charge(user_id, settings.cost_sovmestimost, "sovmestimost_names", {"module": "sovmestimost"})
    try:
        result = compatibility.by_names(payload.name1, payload.name2, requested_language)
    except HTTPException as exc:
        new_balance = refund(
            user_id,
            settings.cost_sovmestimost,
            "sovmestimost_refund",
            {"module": "sovmestimost"},
        )
        return JSONResponse(status_code=exc.status_code, content={"error": _public_error_detail(exc, "compatibility", requested_language), "balance": new_balance})
    except Exception as exc:
        new_balance = refund(
            user_id,
            settings.cost_sovmestimost,
            "sovmestimost_refund",
            {"module": "sovmestimost"},
        )
        return JSONResponse(status_code=502, content={"error": _service_failure_message("compatibility", requested_language), "balance": new_balance})

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
    requested_language = _normalize_lang(payload.language or _resolve_language(email_identity, max_identity, telegram_identity))
    persona1 = _persona_context_from_values(
        user_id=user_id,
        persona_id=payload.persona1_id,
        name=payload.persona1_name or payload.name1,
        birth_date=payload.persona1_birth_date or payload.date1,
        birth_time=payload.persona1_birth_time,
        birth_place=payload.persona1_birth_place,
        note=payload.persona1_note,
        required=True,
    )
    persona2 = _persona_context_from_values(
        user_id=user_id,
        persona_id=payload.persona2_id,
        name=payload.persona2_name or payload.name2,
        birth_date=payload.persona2_birth_date or payload.date2,
        birth_time=payload.persona2_birth_time,
        birth_place=payload.persona2_birth_place,
        note=payload.persona2_note,
        required=True,
    )
    name1 = persona1["name"]
    date1 = persona1["birth_date"]
    name2 = persona2["name"]
    date2 = persona2["birth_date"]
    charge(
        user_id,
        settings.cost_sovmestimost,
        "sovmestimost_names_dates",
        {"module": "sovmestimost"},
    )
    try:
        result = compatibility.by_names_dates(
            name1,
            date1,
            name2,
            date2,
            requested_language,
        )
    except HTTPException as exc:
        new_balance = refund(
            user_id,
            settings.cost_sovmestimost,
            "sovmestimost_refund",
            {"module": "sovmestimost"},
        )
        return JSONResponse(status_code=exc.status_code, content={"error": _public_error_detail(exc, "compatibility", requested_language), "balance": new_balance})
    except Exception as exc:
        new_balance = refund(
            user_id,
            settings.cost_sovmestimost,
            "sovmestimost_refund",
            {"module": "sovmestimost"},
        )
        status_code = 400 if "Invalid date format" in str(exc) else 502
        error = str(exc) if status_code == 400 else _service_failure_message("compatibility", requested_language)
        return JSONResponse(status_code=status_code, content={"error": error, "balance": new_balance})

    db.record_history(
        user_id,
        "sovmestimost_names_dates",
        f"{name1};{date1};{name2};{date2}",
        result,
    )
    return {"success": True, "result": result, "balance": get_balance(user_id)}


@app.post("/api/tarot/reading")
async def api_tarot_reading(
    payload: TarotRequest,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    requested_language = _normalize_lang(payload.language or _resolve_language(email_identity, max_identity, telegram_identity))
    topic = _validate_card_reading_topic(payload.topic)
    spread = _validate_tarot_spread(payload.spread)
    persona_context = _tarot_persona_context(user_id, payload)
    charge(user_id, settings.cost_tarot, "tarot", {"module": "tarot"})
    try:
        result = divination.tarot_reading(payload.question, topic, spread, requested_language, persona_context)
    except HTTPException as exc:
        new_balance = refund(user_id, settings.cost_tarot, "tarot_refund", {"module": "tarot"})
        return JSONResponse(status_code=exc.status_code, content={"error": _public_error_detail(exc, "reading", requested_language), "balance": new_balance})
    except Exception as exc:
        new_balance = refund(user_id, settings.cost_tarot, "tarot_refund", {"module": "tarot"})
        return JSONResponse(status_code=502, content={"error": _service_failure_message("reading", requested_language), "balance": new_balance})

    persona_name = f"; persona={persona_context.get('name')}" if persona_context and persona_context.get("name") else ""
    db.record_history(user_id, "tarot", f"{topic}; {spread}{persona_name}; {payload.question}", result)
    return {"success": True, "result": result, "balance": get_balance(user_id)}


@app.get("/api/tarot-cards/deck")
async def api_tarot_cards_deck(lang: str = Query(default="")):
    requested_language = _normalize_lang(lang)
    return {
        "success": True,
        "deck": tarot_cards.public_deck(requested_language),
        "spreads": tarot_cards.spread_options(requested_language),
    }


@app.post("/api/tarot-cards/draw")
async def api_tarot_cards_draw(payload: TarotCardDrawRequest):
    requested_language = _normalize_lang(payload.language)
    result = tarot_cards.draw_three_cards(payload.spread, requested_language)
    return {"success": True, **result}


@app.post("/api/tarot-cards/reading")
async def api_tarot_cards_reading(
    payload: TarotCardReadingRequest,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    requested_language = _normalize_lang(payload.language or _resolve_language(email_identity, max_identity, telegram_identity))
    try:
        selected_card_ids = tarot_cards.validate_draw_token(payload.draw_token, payload.spread)
    except HTTPException as exc:
        return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail), "balance": get_balance(user_id)})
    charge(user_id, settings.cost_tarot_cards, "tarot_cards", {"module": "tarot_cards", "spread": payload.spread})
    try:
        result = tarot_cards.tarot_card_reading(
            payload.question,
            payload.spread,
            requested_language,
            selected_card_ids,
        )
    except HTTPException as exc:
        new_balance = refund(user_id, settings.cost_tarot_cards, "tarot_cards_refund", {"module": "tarot_cards"})
        return JSONResponse(status_code=exc.status_code, content={"error": _public_error_detail(exc, "reading", requested_language), "balance": new_balance})
    except Exception as exc:
        new_balance = refund(user_id, settings.cost_tarot_cards, "tarot_cards_refund", {"module": "tarot_cards"})
        return JSONResponse(status_code=502, content={"error": _service_failure_message("reading", requested_language), "balance": new_balance})

    cards_summary = ", ".join(card["name"] for card in result["cards"])
    input_text = f"{result['spread']['id']}; {cards_summary}; {payload.question.strip() or '-'}"
    db.record_history(user_id, "tarot_cards", input_text, result["interpretation"])
    return {"success": True, **result, "balance": get_balance(user_id)}


@app.post("/api/astrology/forecast")
async def api_astrology_forecast(
    payload: AstrologyForecastRequest,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    requested_language = _normalize_lang(payload.language or _resolve_language(email_identity, max_identity, telegram_identity))
    compatibility.parse_date(payload.birth_date)
    birth_time = _validate_optional_birth_time(payload.birth_time)
    charge(user_id, settings.cost_astrology, "astrology", {"module": "astrology"})
    try:
        result = divination.astrology_forecast(
            payload.name,
            payload.birth_date,
            birth_time,
            payload.birth_place,
            payload.focus,
            requested_language,
        )
    except HTTPException as exc:
        new_balance = refund(user_id, settings.cost_astrology, "astrology_refund", {"module": "astrology"})
        return JSONResponse(status_code=exc.status_code, content={"error": _public_error_detail(exc, "astrology", requested_language), "balance": new_balance})
    except Exception as exc:
        new_balance = refund(user_id, settings.cost_astrology, "astrology_refund", {"module": "astrology"})
        return JSONResponse(status_code=502, content={"error": _service_failure_message("astrology", requested_language), "balance": new_balance})

    input_text = (
        f"{payload.name}; {payload.birth_date}; {birth_time or '-'}; "
        f"{payload.birth_place or '-'}; {payload.focus or '-'}"
    )
    db.record_history(user_id, "astrology", input_text, result)
    return {"success": True, "result": result, "balance": get_balance(user_id)}
