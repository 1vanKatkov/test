from __future__ import annotations

import json
import re
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlencode
from typing import NamedTuple
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
    ProfileLanguageRequest,
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
from app.web.services.balance import admin_debit, charge, credit, get_balance, get_subscription_info, record_transaction, refund
from app.web.services.mailer import smtp_is_configured
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


LANG_COOKIE_NAME = "astrolhub_lang"
LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365


def _parse_accept_language(header: str = "") -> str:
    if not header:
        return ""
    for part in header.split(","):
        token = part.split(";")[0].strip().lower()
        if token.startswith("en"):
            return "en"
        if token.startswith("ru"):
            return "ru"
    return ""


def _resolve_page_lang(
    request: Request,
    lang_query: str = "",
    identity_lang: str = "",
) -> tuple[str, bool]:
    raw_query = (lang_query or "").strip().lower()
    if raw_query in {"ru", "en"}:
        return raw_query, True

    cookie_lang = (request.cookies.get(LANG_COOKIE_NAME) or "").strip().lower()
    if cookie_lang in {"ru", "en"}:
        return cookie_lang, False

    normalized_identity = _normalize_lang(identity_lang) if identity_lang else ""
    if identity_lang and normalized_identity in {"ru", "en"}:
        return normalized_identity, False

    accept_lang = _parse_accept_language(request.headers.get("accept-language", ""))
    if accept_lang in {"ru", "en"}:
        return accept_lang, False

    return settings.app_default_lang, False


def _set_lang_cookie(response: HTMLResponse | JSONResponse | RedirectResponse, lang: str) -> None:
    response.set_cookie(
        LANG_COOKIE_NAME,
        _normalize_lang(lang),
        max_age=LANG_COOKIE_MAX_AGE,
        httponly=False,
        samesite="lax",
        path="/",
    )


def _url_without_lang(request: Request) -> str:
    params = [(key, value) for key, value in request.query_params.multi_items() if key != "lang"]
    query = urlencode(params)
    path = request.url.path
    return f"{path}?{query}" if query else path


class ClientAuthContext(NamedTuple):
    email: EmailIdentity | None
    max: MaxIdentity | None
    telegram: TelegramIdentity | None


async def optional_client_auth(
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
) -> ClientAuthContext:
    return ClientAuthContext(email_identity, max_identity, telegram_identity)


def _cookie_lang(request: Request) -> str:
    cookie_lang = (request.cookies.get(LANG_COOKIE_NAME) or "").strip().lower()
    if cookie_lang in {"ru", "en"}:
        return cookie_lang
    return ""


def _effective_auth_lang(request: Request, payload_lang: str = "") -> str:
    cookie_lang = _cookie_lang(request)
    if cookie_lang:
        return cookie_lang
    return _normalize_lang(payload_lang)


def _sync_guest_lang_after_auth(request: Request, user_id: int, current_lang: str) -> str:
    cookie_lang = _cookie_lang(request)
    if cookie_lang:
        db.update_user_language(user_id, cookie_lang)
        return cookie_lang
    return _normalize_lang(current_lang)


def _sync_profile_language_from_explicit_choice(
    auth: ClientAuthContext | None,
    page_lang: str,
) -> None:
    if not auth:
        return
    user_id, _provider = _require_authenticated_user(auth.max, auth.telegram, auth.email)
    db.update_user_language(user_id, page_lang)


def _render_client_page(
    request: Request,
    template_name: str,
    lang_query: str = "",
    *,
    auth: ClientAuthContext | None = None,
    selected_card_topic: str = "",
    extra_context: dict | None = None,
) -> HTMLResponse:
    raw_query = (lang_query or "").strip().lower()
    if raw_query in {"ru", "en"}:
        page_lang = raw_query
        response = RedirectResponse(url=_url_without_lang(request), status_code=302)
        _set_lang_cookie(response, page_lang)
        _sync_profile_language_from_explicit_choice(auth, page_lang)
        return response

    identity_lang = ""
    if auth and (auth.email or auth.max or auth.telegram):
        identity_lang = _resolve_language(auth.email, auth.max, auth.telegram)
    page_lang, set_cookie = _resolve_page_lang(request, "", identity_lang)
    context = _client_template_context(request, page_lang, selected_card_topic=selected_card_topic)
    if extra_context:
        context.update(extra_context)
    response = templates.TemplateResponse(request=request, name=template_name, context=context)
    if set_cookie:
        _set_lang_cookie(response, page_lang)
        _sync_profile_language_from_explicit_choice(auth, page_lang)
    return response


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


def _validate_required_birth_time(value: str) -> str:
    normalized = _validate_optional_birth_time(value)
    if not normalized:
        raise HTTPException(status_code=400, detail="Birth time is required")
    return normalized


def _clean_persona_payload(payload: PersonaCreateRequest | PersonaUpdateRequest) -> dict[str, str]:
    birth_date = payload.birth_date.strip()
    compatibility.parse_date(birth_date)
    birth_place = payload.birth_place.strip()
    if not birth_place:
        raise HTTPException(status_code=400, detail="Birth place is required")
    return {
        "name": payload.name.strip(),
        "birth_date": birth_date,
        "birth_time": _validate_required_birth_time(payload.birth_time),
        "birth_place": birth_place,
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
    require_birth_details: bool = True,
) -> dict | None:
    if persona_id:
        row = db.get_persona(user_id=user_id, persona_id=persona_id)
        if not row:
            raise HTTPException(status_code=404, detail="Persona not found")
        if (
            required
            and require_birth_details
            and (not (row["birth_time"] or "").strip() or not (row["birth_place"] or "").strip())
        ):
            raise HTTPException(status_code=400, detail="Birth time and birth place are required")
        return _serialize_persona(row)

    name = name.strip()
    birth_date = birth_date.strip()
    birth_time = _validate_optional_birth_time(birth_time)
    birth_place = birth_place.strip()
    note = note.strip()
    if not required and not (name or birth_date or birth_time or birth_place or note):
        return None
    if not name or not birth_date:
        if require_birth_details:
            raise HTTPException(
                status_code=400,
                detail="Choose a saved persona or enter name, birth date, birth time, and birth place",
            )
        raise HTTPException(status_code=400, detail="Choose a saved persona or enter name and birth date")
    if require_birth_details:
        if not birth_time:
            raise HTTPException(status_code=400, detail="Birth time is required")
        if not birth_place:
            raise HTTPException(status_code=400, detail="Birth place is required")
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


def _optional_persona_from_payload(user_id: int, payload) -> dict | None:
    return _persona_context_from_values(
        user_id=user_id,
        persona_id=getattr(payload, "persona_id", 0) or 0,
        name=getattr(payload, "persona_name", "") or "",
        birth_date=getattr(payload, "persona_birth_date", "") or "",
        birth_time=getattr(payload, "persona_birth_time", "") or "",
        birth_place=getattr(payload, "persona_birth_place", "") or "",
        note=getattr(payload, "persona_note", "") or "",
        required=False,
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


def _email_auth_response(
    identity: EmailIdentity,
    is_new_user: bool = False,
    request: Request | None = None,
) -> JSONResponse:
    language = identity.language
    if request is not None:
        language = _sync_guest_lang_after_auth(request, identity.internal_user_id, language)
    token = issue_email_auth_token(identity)
    response_data = {
        "success": True,
        "is_new_user": is_new_user,
        "token": token,
        "profile": {
            "provider": "email",
            "provider_user_id": identity.user_id,
            "username": identity.username,
            "language": language,
        },
        "balance": get_balance(identity.internal_user_id),
    }
    response = JSONResponse(content=response_data)
    _set_email_auth_cookie(response, token)
    if request is not None and language in {"ru", "en"}:
        _set_lang_cookie(response, language)
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
            "tarot_cards_question": "Ask your question",
            "tarot_cards_choose_hint": "What do you want to know?",
            "tarot_cards_selected": "Your spread",
            "get_tarot_cards_reading": "Get tarot reading",
            "tarot_flow_title": "What do you want to know?",
            "tarot_partner_name": "Partner's name (optional)",
            "tarot_relationships_focus": "What interests you?",
            "tarot_question_examples": "Examples",
            "tarot_shuffling": "Selecting cards for your situation...",
            "tarot_another_spread": "Get another spread",
            "tarot_start_reading": "Draw the cards",
            "tarot_back_topics": "Back to topics",
            "tarot_result_title": "Your spread",
            "tarot_confirm_ready": "Ready for your reading",
            "tarot_confirm_hint": "Press the button below to draw the cards.",
            "get_tarot_reading": "Get natal chart",
            "open_natal_map_form": "Open natal chart form",
            "persona_required_error": "Choose a saved persona or enter name, birth date, birth time, and birth place.",
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
            "astrology_birth_time": "Birth time",
            "astrology_birth_place": "Birth place",
            "astrology_focus": "Question or focus",
            "get_astrology_forecast": "Get forecast",
            "name_1": "Name 1",
            "name_2": "Name 2",
            "compat_step_intro": "Enter the first and second person",
            "compat_step_first": "Enter the first person",
            "compat_step_second": "Enter the second person",
            "compat_next_button": "Next",
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
            "password_reset_code_hint": "We will send a code to your email. Enter it to continue.",
            "next": "Next",
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
            "dashboard_slide_intro_title": "Astrolhub in one screen",
            "dashboard_slide_intro_text": "A personalized AI space for dreams, numerology, compatibility, and astrology insights.",
            "dashboard_slide_intro_card_1_title": "Know yourself deeper",
            "dashboard_slide_intro_card_1_text": "Each tool gives concise insights about your current state, patterns, and direction.",
            "dashboard_slide_intro_card_2_title": "Your personal context",
            "dashboard_slide_intro_card_2_text": "Save personas once and use them across services to build a consistent self-discovery path.",
            "dashboard_slide_intro_card_3_title": "From overview to practice",
            "dashboard_slide_intro_card_3_text": "Move to services in one swipe and start exploring yourself right away.",
            "dashboard_slide_go_services": "Go to services",
            "notifications": "Notifications",
            "language_switch_label": "Language",
            "dashboard_template_subtitle": "Your guide in the world of self-discovery",
            "dashboard_template_section_title": "Understand yourself deeper with Astrolhub",
            "dashboard_template_section_subtitle": "Dreams, relationships, personal potential and life scenarios — in one space.",
            "dashboard_template_cards_label": "Self-knowledge benefits",
            "dashboard_template_card_personal_title": "Personalized analysis",
            "dashboard_template_card_personal_text": "Readings tailored to your questions and life context.",
            "dashboard_template_card_holistic_title": "Holistic view",
            "dashboard_template_card_holistic_text": "Dreams, relationships and potential in one picture.",
            "dashboard_template_card_practical_title": "Practical application",
            "dashboard_template_card_practical_text": "Concrete steps and scenarios for important decisions.",
            "dashboard_template_cta": "Get your first reading",
            "plus_badge": "Plus",
            "plus_subscription_title": "Astrolhub Plus",
            "plus_subscription_intro": "Astrolhub Plus subscription",
            "plus_subscription_price": "149 ₽ per month",
            "plus_subscription_sparks_note": "Includes 150 sparks on purchase",
            "plus_subscription_benefit_1": "Up to 30 dream interpretations",
            "plus_subscription_benefit_2": "Up to 30 compatibility analyses",
            "plus_subscription_benefit_3": "Up to 15 numerology reports",
            "plus_subscription_benefit_4": "Reading history",
            "plus_subscription_benefit_5": "Priority generation",
            "plus_subscription_benefit_6": "Early access to new features",
            "plus_subscription_cta": "Subscribe to Plus",
            "plus_subscription_active": "Plus subscription is active",
            "topup_tab_sparks": "Buy sparks",
            "topup_tab_plus": "Astrolhub Plus",
            "topup_choice_subscribe": "Subscribe to Plus",
            "topup_choice_buy_sparks": "Buy sparks",
            "dashboard_slide_services_title": "All functionality",
            "dashboard_slide_faq_title": "FAQ: Answers to questions",
            "dashboard_slide_faq_subtitle": "Short answers about how Astrolhub works and what to expect from readings.",
            "dashboard_faq_q1": "Do I need an exact birth time?",
            "dashboard_faq_a1": "For astrology — yes, it improves accuracy. For numerology, name and birth date are enough; birth time is not required.",
            "dashboard_faq_q2": "Are the readings strict predictions?",
            "dashboard_faq_a2": "No. They help you see patterns, timing, and options. Final decisions always stay with you.",
            "dashboard_faq_q3": "What are sparks used for?",
            "dashboard_faq_a3": "Sparks are spent to generate reports. Each service shows its cost before you start.",
            "dashboard_faq_q4": "Can I save people once and reuse them?",
            "dashboard_faq_a4": "Yes. Save personas in your profile and use them across dreams, numerology, compatibility, and astrology.",
            "dashboard_faq_q5": "When should I not rely on a reading?",
            "dashboard_faq_a5": "Do not use readings for medical, legal, or emergency decisions. They are for reflection, not professional advice.",
            "dashboard_slider_nav_label": "Dashboard slides",
            "dashboard_slider_dot_intro": "Project overview",
            "dashboard_slider_dot_services": "Feature list",
            "dashboard_slider_dot_faq": "FAQ",
            "dashboard_slider_swipe_hint": "Swipe to switch slides",
            "feature_sonnik_desc": "AI-powered dream interpretation with symbols and context.",
            "feature_numerology_desc": "Personal report based on full name and birth date.",
            "feature_compatibility_desc": "Relationship and compatibility analysis in two modes.",
            "feature_tarot_desc": "Personal astrology-style maps for money, love, career, strengths, and life patterns.",
            "feature_tarot_cards_desc": "Classic tarot reading with cards, spreads, and symbolic guidance.",
            "feature_astrology_desc": "Personal astrological forecast by date, place, and current focus.",
            "about_astrology": "About astrology",
            "about_tarot_cards": "About Tarot cards",
            "about_sonnik": "About dreambook",
            "about_compatibility": "About compatibility",
            "about_numerology": "About numerology",
            "about_service_badge": "How this tool works",
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
        "home": "Главная",
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
        "tarot_cards_question": "Задайте свой вопрос",
        "tarot_cards_choose_hint": "Что вы хотите узнать?",
        "tarot_cards_selected": "Ваш расклад",
        "get_tarot_cards_reading": "Получить гадание Таро",
        "tarot_flow_title": "Что вы хотите узнать?",
        "tarot_partner_name": "Имя партнёра (необязательно)",
        "tarot_relationships_focus": "Что вас интересует?",
        "tarot_question_examples": "Примеры",
        "tarot_shuffling": "Подбираем карты для вашей ситуации…",
        "tarot_another_spread": "Получить другой расклад",
        "tarot_start_reading": "Вытянуть карты",
        "tarot_back_topics": "К выбору темы",
        "tarot_result_title": "Ваш расклад",
        "tarot_confirm_ready": "Готово к разбору",
        "tarot_confirm_hint": "Нажмите кнопку ниже, чтобы вытянуть карты.",
        "get_tarot_reading": "Получить натальную карту",
        "open_natal_map_form": "Открыть форму натальной карты",
        "persona_required_error": "Выберите сохранённую персону или введите имя, дату, время и место рождения.",
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
        "astrology_birth_time": "Время рождения",
        "astrology_birth_place": "Место рождения",
        "astrology_focus": "Вопрос или фокус",
        "get_astrology_forecast": "Получить прогноз",
        "name_1": "Имя 1",
        "name_2": "Имя 2",
        "compat_step_intro": "Введите первую и вторую личность",
        "compat_step_first": "Введите первую личность",
        "compat_step_second": "Введите вторую личность",
        "compat_next_button": "Далее",
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
        "password_reset_code_hint": "Отправим код на вашу почту. Введите его, чтобы продолжить.",
        "next": "Далее",
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
        "dashboard_slide_intro_title": "Astrolhub в одном экране",
        "dashboard_slide_intro_text": "Персональное AI-пространство для снов, нумерологии, совместимости и астрологических разборов.",
        "dashboard_slide_intro_card_1_title": "Познайте себя глубже",
        "dashboard_slide_intro_card_1_text": "Каждый сервис дает краткие инсайты о вашем состоянии, сценариях и векторе развития.",
        "dashboard_slide_intro_card_2_title": "Ваш личный контекст",
        "dashboard_slide_intro_card_2_text": "Сохраните персоны один раз и используйте их во всех сервисах для цельной картины самопознания.",
        "dashboard_slide_intro_card_3_title": "От обзора к практике",
        "dashboard_slide_intro_card_3_text": "Переходите к сервисам одним свайпом и сразу начинайте исследовать себя.",
        "dashboard_slide_go_services": "К сервису",
        "notifications": "Уведомления",
        "language_switch_label": "Язык",
        "dashboard_template_subtitle": "Ваш проводник в мире самопознания",
        "dashboard_template_section_title": "Поймите себя глубже с Astrolhub",
        "dashboard_template_section_subtitle": "Сны, отношения, личный потенциал и жизненные сценарии — в одном пространстве.",
        "dashboard_template_cards_label": "Преимущества самопознания",
        "dashboard_template_card_personal_title": "Персональный разбор",
        "dashboard_template_card_personal_text": "Индивидуальные интерпретации под ваш запрос и контекст.",
        "dashboard_template_card_holistic_title": "Целостный взгляд",
        "dashboard_template_card_holistic_text": "Сны, отношения и потенциал — в единой картине.",
        "dashboard_template_card_practical_title": "Практическое применение",
        "dashboard_template_card_practical_text": "Конкретные шаги и сценарии для важных решений.",
        "dashboard_template_cta": "Получить первый разбор",
        "plus_badge": "Plus",
        "plus_subscription_title": "Astrolhub Plus",
        "plus_subscription_intro": "Подписка Astrolhub Plus",
        "plus_subscription_price": "149 ₽ в месяц",
        "plus_subscription_sparks_note": "При оплате начисляется 150 искр",
        "plus_subscription_benefit_1": "до 30 разборов снов",
        "plus_subscription_benefit_2": "до 30 разборов совместимости",
        "plus_subscription_benefit_3": "до 15 нумерологических разборов",
        "plus_subscription_benefit_4": "история разборов",
        "plus_subscription_benefit_5": "приоритетная генерация",
        "plus_subscription_benefit_6": "ранний доступ к новым функциям",
        "plus_subscription_cta": "Оформить Plus",
        "plus_subscription_active": "Подписка Plus активна",
        "topup_tab_sparks": "Купить искры",
        "topup_tab_plus": "Astrolhub Plus",
        "topup_choice_subscribe": "Оформить подписку",
        "topup_choice_buy_sparks": "Купить искры",
        "dashboard_slide_services_title": "Разборы",
        "dashboard_slide_faq_title": "FAQ: Ответы на вопросы",
        "dashboard_slide_faq_subtitle": "Кратко о том, как работает Astrolhub и чего ждать от разборов.",
        "dashboard_faq_q1": "Нужно ли точное время рождения?",
        "dashboard_faq_a1": "Для астрологии — да, оно повышает точность. Для нумерологии достаточно имени и даты рождения; время вводить не нужно.",
        "dashboard_faq_q2": "Разборы — это жёсткие предсказания?",
        "dashboard_faq_a2": "Нет. Они помогают увидеть паттерны, периоды и варианты. Решения всегда остаются за вами.",
        "dashboard_faq_q3": "Зачем нужны искры?",
        "dashboard_faq_a3": "Искры списываются за генерацию разборов. Стоимость каждого сервиса видна до запуска.",
        "dashboard_faq_q4": "Можно сохранить данные один раз и использовать снова?",
        "dashboard_faq_a4": "Да. Сохраните персоны в профиле и используйте их в соннике, нумерологии, совместимости и астрологии.",
        "dashboard_faq_q5": "Когда на разбор лучше не опираться?",
        "dashboard_faq_a5": "Не используйте разборы для медицинских, юридических или экстренных решений. Это инструмент для рефлексии, а не замена специалиста.",
        "dashboard_slider_nav_label": "Слайды кабинета",
        "dashboard_slider_dot_intro": "О проекте",
        "dashboard_slider_dot_services": "Функционал",
        "dashboard_slider_dot_faq": "FAQ",
        "dashboard_slider_swipe_hint": "Свайпните для переключения слайдов",
        "feature_sonnik_desc": "Разбор снов с помощью AI-интерпретации символов и контекста.",
        "feature_numerology_desc": "Персональный разбор по ФИО и дате рождения.",
        "feature_compatibility_desc": "Анализ отношений и совместимости в двух режимах.",
        "feature_tarot_desc": "Персональная астрология про деньги, любовь, карьеру, сильные качества и жизненные сценарии.",
        "feature_tarot_cards_desc": "Классическое гадание по картам Таро с раскладами и символическими подсказками.",
        "feature_astrology_desc": "Персональный астропрогноз по дате, месту и текущему фокусу.",
        "about_astrology": "Об астрологии",
        "about_tarot_cards": "О картах Таро",
        "about_sonnik": "О соннике",
        "about_compatibility": "О совместимости",
        "about_numerology": "О нумерологии",
        "about_service_badge": "Как работает инструмент",
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


def _service_about_pages(lang: str) -> dict[str, dict]:
    page_lang = _normalize_lang(lang)
    if page_lang == "en":
        return {
            "astrology": {
                "title": "About Astrology",
                "subtitle": "Astrology is a language of cycles, temperament, timing, and personal focus.",
                "back_url": "/client/tarot",
                "back_label": "Back to Astrology",
                "items": [
                    {
                        "question": "Why does astrology need exact birth data?",
                        "answer": (
                            "Date, time, and place help place the chart in context. Without them, an interpretation becomes too general: "
                            "it may describe common tendencies, but it loses the personal rhythm of the chart."
                        ),
                    },
                    {
                        "question": "Is an astrology reading a strict prediction?",
                        "answer": (
                            "No. A good reading works with probabilities, inner patterns, and periods of increased attention. "
                            "It does not replace personal choice; it helps you notice what deserves more care."
                        ),
                    },
                    {
                        "question": "What should I ask astrology about?",
                        "answer": (
                            "It is best suited for themes like self-understanding, work direction, relationships, resources, habits, and timing. "
                            "The clearer the focus, the more useful the answer."
                        ),
                    },
                    {
                        "question": "When should an astrology reading be postponed?",
                        "answer": (
                            "If you are looking for a medical, legal, or emergency decision, astrology should not be the deciding tool. "
                            "Use it as reflection, not as a substitute for professional help."
                        ),
                    },
                ],
            },
            "tarot-cards": {
                "title": "About Tarot Cards",
                "subtitle": "Tarot is a symbolic conversation with a situation, not a way to remove responsibility.",
                "back_url": "/client/tarot-cards",
                "back_label": "Back to Tarot",
                "items": [
                    {
                        "question": "Why can Tarot be hard to interpret?",
                        "answer": (
                            "A card changes meaning depending on context. The same symbol can speak about fear, opportunity, delay, "
                            "or an important choice. That is why a clear question matters."
                        ),
                    },
                    {
                        "question": "Can Tarot cards be wrong?",
                        "answer": (
                            "The cards do not work like a machine that prints fate. The risk is usually in interpretation: missing context, "
                            "reading too literally, or turning a likely scenario into a verdict."
                        ),
                    },
                    {
                        "question": "What questions should not be asked?",
                        "answer": (
                            "Avoid questions about health diagnoses, life and death, gambling, or decisions that require a qualified specialist. "
                            "Tarot is better for reflection, motives, choices, and possible consequences."
                        ),
                    },
                    {
                        "question": "What makes a Tarot answer useful?",
                        "answer": (
                            "A useful answer does not frighten or command you. It shows the dynamics of the situation, possible blind spots, "
                            "and a calmer way to act."
                        ),
                    },
                ],
            },
            "sonnik": {
                "title": "About Dreambook",
                "subtitle": "Dream interpretation works best when symbols are connected to your real emotional context.",
                "back_url": "/client/sonnik",
                "back_label": "Back to Dreambook",
                "items": [
                    {
                        "question": "Why can the same dream mean different things?",
                        "answer": (
                            "Dream symbols are personal. Water, a house, a road, or an animal can point to different feelings for different people. "
                            "Details and emotions help narrow the meaning."
                        ),
                    },
                    {
                        "question": "What should I include in a dream description?",
                        "answer": (
                            "Describe what happened, what you felt, who was present, colors or places you remember, and what stayed with you after waking up."
                        ),
                    },
                    {
                        "question": "Can a dream predict the future?",
                        "answer": (
                            "Usually dreams reflect tension, desire, memory, fear, or intuition. Treat them as signals from the psyche, "
                            "not as literal commands."
                        ),
                    },
                    {
                        "question": "When is a dream interpretation not enough?",
                        "answer": (
                            "If dreams are frightening, recurring, or affect sleep and daily life, interpretation can support reflection, "
                            "but professional psychological help may be more important."
                        ),
                    },
                ],
            },
            "compatibility": {
                "title": "About Compatibility",
                "subtitle": "Compatibility is a way to compare rhythms, needs, and communication patterns between two people.",
                "back_url": "/client/compatibility",
                "back_label": "Back to Compatibility",
                "items": [
                    {
                        "question": "What does compatibility analysis show?",
                        "answer": (
                            "It highlights where two people may understand each other easily and where tension can appear: pace, emotional style, "
                            "expectations, and ways of making decisions."
                        ),
                    },
                    {
                        "question": "Does low compatibility mean a relationship is doomed?",
                        "answer": (
                            "No. Difficult aspects are not a sentence. They show where more honesty, boundaries, or patience may be needed."
                        ),
                    },
                    {
                        "question": "Why are names and birth dates important?",
                        "answer": (
                            "They give the system stable personal markers. The more complete the data, the less generic the comparison becomes."
                        ),
                    },
                    {
                        "question": "How should the result be used?",
                        "answer": (
                            "Use it as a map for conversation. The goal is not to label a person, but to see where both sides can meet more consciously."
                        ),
                    },
                ],
            },
            "numerology": {
                "title": "About Numerology",
                "subtitle": "Numerology translates a name and birth date into a structured symbolic portrait.",
                "back_url": "/client/numerology",
                "back_label": "Back to Numerology",
                "items": [
                    {
                        "question": "What does a numerology report describe?",
                        "answer": (
                            "It looks at key numbers connected with character, energy, talents, challenges, and recurring life themes."
                        ),
                    },
                    {
                        "question": "Why does the full name matter?",
                        "answer": (
                            "The name gives a separate layer from the birth date. Together they create a richer portrait than either field alone."
                        ),
                    },
                    {
                        "question": "Is numerology a final definition of personality?",
                        "answer": (
                            "No. It is a symbolic framework. It can show tendencies and questions worth exploring, but it should not limit how a person sees themselves."
                        ),
                    },
                    {
                        "question": "How can I get the most from the report?",
                        "answer": (
                            "Read it as a reflection tool: note what resonates, what irritates, and what suggests a practical next step."
                        ),
                    },
                ],
            },
        }

    return {
        "astrology": {
            "title": "Об астрологии",
            "subtitle": "Астрология помогает увидеть личные ритмы, сильные стороны, периоды внимания и темы, которые сейчас требуют осознанности.",
            "back_url": "/client/tarot",
            "back_label": "Назад к Астрологии",
            "items": [
                {
                    "question": "Почему в астрологии важны точное время и место рождения?",
                    "answer": (
                        "Дата показывает базовый цикл, но время и место уточняют личный контекст. Без них разбор становится более общим: "
                        "можно описать характерные тенденции, но сложнее увидеть индивидуальные акценты, дома и точные жизненные сферы."
                    ),
                },
                {
                    "question": "Астрология предсказывает судьбу буквально?",
                    "answer": (
                        "Нет. Хороший астрологический разбор не должен звучать как приговор. Он показывает вероятности, внутренние закономерности "
                        "и периоды, когда определённые темы становятся заметнее. Решение всё равно остаётся за человеком."
                    ),
                },
                {
                    "question": "С какими вопросами лучше обращаться к астрологии?",
                    "answer": (
                        "Лучше всего подходят вопросы про самоощущение, отношения, работу, деньги, выбор направления, повторяющиеся сценарии "
                        "и личный ресурс. Чем конкретнее фокус, тем точнее и полезнее получится ответ."
                    ),
                },
                {
                    "question": "Когда астрологический разбор лучше не использовать?",
                    "answer": (
                        "Если вопрос касается диагноза, юридического решения, экстренной ситуации или безопасности, астрология не заменяет специалиста. "
                        "Её задача — помочь посмотреть на ситуацию шире, а не отменить ответственность и реальные действия."
                    ),
                },
                {
                    "question": "Чем полезна астрология в повседневной жизни?",
                    "answer": (
                        "Она помогает мягче относиться к своим особенностям, замечать подходящие периоды для действий и лучше понимать, "
                        "какие темы сейчас требуют внимания, дисциплины или отдыха."
                    ),
                },
            ],
        },
        "tarot-cards": {
            "title": "О картах Таро",
            "subtitle": "Таро — это язык символов и способ посмотреть на ситуацию со стороны, а не инструмент запугивания или жёсткого программирования.",
            "back_url": "/client/tarot-cards",
            "back_label": "Назад к Таро",
            "items": [
                {
                    "question": "Почему возникают сложности в интерпретации карт Таро?",
                    "answer": (
                        "Одна и та же карта меняет оттенок в зависимости от вопроса и контекста. Люди часто ждут, что карты сами расскажут всё "
                        "«из воздуха», но точный расклад — это совместная работа: важно понимать ситуацию, эмоции, ограничения и реальный выбор человека."
                    ),
                },
                {
                    "question": "Какие карты Таро считаются особенно благоприятными?",
                    "answer": (
                        "Удачными часто воспринимаются Солнце, Звезда, Мир, Императрица, Император, Туз Пентаклей, Туз Кубков, Туз Жезлов, "
                        "Четвёрка и Шестёрка Жезлов, Девятка Пентаклей, Десятка Кубков и Десятка Пентаклей. Но даже сложные карты могут быть полезными: "
                        "они показывают рост, честность и необходимость перемен."
                    ),
                },
                {
                    "question": "В каких случаях не стоит гадать на Таро?",
                    "answer": (
                        "Не стоит спрашивать карты о диагнозах, жизни и смерти, случайных выигрышах, чужой личной воле или решениях, где нужен врач, юрист "
                        "или другой специалист. Также лучше отложить расклад, если вы сильно устали, находитесь в панике или хотите получить ответ любой ценой."
                    ),
                },
                {
                    "question": "Чем могут быть опасны карты Таро?",
                    "answer": (
                        "Опасны не сами карты, а категоричность. Если воспринимать расклад как неизбежный приговор, можно отказаться от выбора и ответственности. "
                        "Здоровый подход к Таро помогает увидеть варианты, а не привязать человека к одному сценарию."
                    ),
                },
                {
                    "question": "Когда карты Таро могут «врать»?",
                    "answer": (
                        "Чаще всего ошибается не колода, а трактовка: недостаточно контекста, вопрос сформулирован расплывчато, или человек проецирует на карты "
                        "собственные страхи. Чем честнее запрос и спокойнее состояние, тем полезнее получается разбор."
                    ),
                },
            ],
        },
        "sonnik": {
            "title": "О соннике",
            "subtitle": "Сонник помогает перевести образы сна на язык эмоций, внутренних процессов и сигналов, которые психика показывает через символы.",
            "back_url": "/client/sonnik",
            "back_label": "Назад к Соннику",
            "items": [
                {
                    "question": "Почему один и тот же сон может значить разное?",
                    "answer": (
                        "Символы сна зависят от личного опыта. Вода для одного человека — спокойствие, для другого — тревога; дом может означать безопасность, "
                        "память, семью или границы. Поэтому важны не только события сна, но и ощущения внутри него."
                    ),
                },
                {
                    "question": "Что лучше описывать в запросе?",
                    "answer": (
                        "Напишите сюжет, людей, место, яркие предметы, цвета, повторяющиеся детали и главное — свои эмоции. Иногда именно чувство после пробуждения "
                        "становится ключом к толкованию."
                    ),
                },
                {
                    "question": "Сны действительно предсказывают будущее?",
                    "answer": (
                        "Чаще сон не предсказывает событие буквально, а показывает внутреннее напряжение, страх, желание, интуитивную догадку или неосознанную связь. "
                        "Его полезнее воспринимать как письмо от психики, а не как приказ."
                    ),
                },
                {
                    "question": "Почему сонник не даёт один универсальный ответ?",
                    "answer": (
                        "Универсальные значения могут быть отправной точкой, но точный смысл рождается из контекста. Чем подробнее описан сон, тем меньше риск "
                        "получить слишком общую интерпретацию."
                    ),
                },
                {
                    "question": "Когда толкования сна недостаточно?",
                    "answer": (
                        "Если кошмары повторяются, нарушают сон или усиливают тревогу, толкование может помочь осмыслить состояние, но не заменяет поддержку психолога "
                        "или врача."
                    ),
                },
            ],
        },
        "compatibility": {
            "title": "О совместимости",
            "subtitle": "Совместимость — это не приговор отношениям, а карта различий, точек притяжения и мест, где важно договариваться.",
            "back_url": "/client/compatibility",
            "back_label": "Назад к Совместимости",
            "items": [
                {
                    "question": "Что показывает разбор совместимости?",
                    "answer": (
                        "Он помогает увидеть, где людям легче понимать друг друга, а где могут возникать трения: темп жизни, эмоциональные реакции, ожидания, "
                        "способ говорить о чувствах и принимать решения."
                    ),
                },
                {
                    "question": "Низкая совместимость означает, что отношения обречены?",
                    "answer": (
                        "Нет. Сложные сочетания не запрещают отношения. Они показывают зоны, где потребуется больше честности, терпения, уважения к границам "
                        "и готовности слышать другого."
                    ),
                },
                {
                    "question": "Почему важны данные обеих персон?",
                    "answer": (
                        "Имя, дата, время и место рождения дают больше опор для анализа. Так сравнение становится не абстрактным, а привязанным к двум конкретным людям."
                    ),
                },
                {
                    "question": "Как правильно использовать результат?",
                    "answer": (
                        "Лучше воспринимать его как тему для разговора. Разбор не должен навешивать ярлыки, он помогает увидеть, где пара может стать внимательнее "
                        "и осознаннее."
                    ),
                },
                {
                    "question": "Можно ли смотреть совместимость не только в любви?",
                    "answer": (
                        "Да. Такой анализ может быть полезен для дружбы, семьи, рабочих партнёрств и любых отношений, где важны ожидания, доверие и общий ритм."
                    ),
                },
            ],
        },
        "numerology": {
            "title": "О нумерологии",
            "subtitle": "Нумерология превращает имя и дату рождения в символическую структуру, через которую проще увидеть качества, задачи и повторяющиеся темы.",
            "back_url": "/client/numerology",
            "back_label": "Назад к Нумерологии",
            "items": [
                {
                    "question": "Что описывает нумерологический разбор?",
                    "answer": (
                        "Он показывает ключевые числа, связанные с характером, энергией, сильными сторонами, внутренними противоречиями, задачами развития "
                        "и привычными сценариями поведения."
                    ),
                },
                {
                    "question": "Почему важно указывать полное имя?",
                    "answer": (
                        "Имя даёт отдельный слой смысла, а дата рождения — другой. Вместе они создают более объёмный портрет, чем один показатель."
                    ),
                },
                {
                    "question": "Нумерология точно определяет личность?",
                    "answer": (
                        "Нет. Это символическая система, а не клетка для человека. Она может подсветить склонности и вопросы для размышления, но не должна ограничивать "
                        "самовосприятие."
                    ),
                },
                {
                    "question": "Как читать разбор с пользой?",
                    "answer": (
                        "Обращайте внимание не только на то, что приятно совпадает, но и на пункты, которые вызывают сопротивление. Часто именно там находится важная тема."
                    ),
                },
                {
                    "question": "Когда стоит возвращаться к нумерологическому отчёту?",
                    "answer": (
                        "К нему полезно возвращаться в периоды выбора, смены работы, переоценки целей или когда хочется лучше понять свои реакции и повторяющиеся решения."
                    ),
                },
            ],
        },
    }


def _service_about_page(slug: str, lang: str) -> dict:
    pages = _service_about_pages(lang)
    if slug not in pages:
        raise HTTPException(status_code=404, detail="About page not found")
    return pages[slug]


def _resolve_about_back_url(back: str, default: str) -> str:
    normalized = (back or "").strip()
    if not normalized:
        return default
    if not normalized.startswith("/client"):
        return default
    if normalized.startswith("/client/about"):
        return default
    return normalized


def _is_recognized_request(request: Request, name: str = "", platform: str = "") -> bool:
    if name.strip() or platform.strip():
        return True
    if request.headers.get("X-Telegram-Init-Data"):
        return True
    if request.headers.get("X-Max-User-Id"):
        return True
    return False


def _client_url_with_query(name: str = "", platform: str = "") -> str:
    params = {}
    if name.strip():
        params["name"] = name.strip()
    if platform.strip():
        params["platform"] = platform.strip().lower()
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


@app.get("/", include_in_schema=False)
async def root(
    request: Request,
    name: str = Query(default=""),
    platform: str = Query(default=""),
    lang: str = Query(default=""),
):
    page_lang, set_cookie = _resolve_page_lang(request, lang)
    if _is_recognized_request(request, name=name, platform=platform):
        response = RedirectResponse(url=_client_url_with_query(name=name, platform=platform))
        if set_cookie:
            _set_lang_cookie(response, page_lang)
        return response

    response = RedirectResponse(url="/client", status_code=302)
    if set_cookie:
        _set_lang_cookie(response, page_lang)
    return response


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
        "assets_version": "bottom-nav-nowrap-v1",
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
async def client_dashboard(
    request: Request,
    lang: str = Query(default=""),
    auth: ClientAuthContext = Depends(optional_client_auth),
):
    return _render_client_page(request, "client_dashboard.html", lang, auth=auth)


def _render_client_register(request: Request, lang_query: str, auth: ClientAuthContext | None = None):
    return _render_client_page(request, "client_register.html", lang_query, auth=auth)


def _render_client_login(request: Request, lang_query: str, auth: ClientAuthContext | None = None):
    return _render_client_page(request, "client_login.html", lang_query, auth=auth)


@app.get("/client/register", response_class=HTMLResponse, include_in_schema=False)
@app.get("/client/sign-up", response_class=HTMLResponse, include_in_schema=False)
async def client_register(
    request: Request,
    lang: str = Query(default=""),
    auth: ClientAuthContext = Depends(optional_client_auth),
):
    return _render_client_register(request, lang, auth=auth)


@app.get("/client/register/verify", response_class=HTMLResponse, include_in_schema=False)
async def client_register_verify(
    request: Request,
    lang: str = Query(default=""),
    email: str = Query(default=""),
    auth: ClientAuthContext = Depends(optional_client_auth),
):
    page_lang, set_cookie = _resolve_page_lang(
        request,
        lang,
        _resolve_language(auth.email, auth.max, auth.telegram) if auth else "",
    )
    normalized = ""
    try:
        normalized = normalize_email(email)
    except HTTPException:
        response = RedirectResponse(url="/client/register", status_code=302)
        if set_cookie:
            _set_lang_cookie(response, page_lang)
        return response
    if settings.email_skip_verification or not has_pending_registration(normalized):
        response = RedirectResponse(url="/client/register", status_code=302)
        if set_cookie:
            _set_lang_cookie(response, page_lang)
        return response
    return _render_client_page(
        request,
        "client_register_verify.html",
        lang,
        auth=auth,
        extra_context={"register_email": normalized},
    )


@app.get("/client/login", response_class=HTMLResponse, include_in_schema=False)
@app.get("/client/sign-in", response_class=HTMLResponse, include_in_schema=False)
async def client_login(
    request: Request,
    lang: str = Query(default=""),
    auth: ClientAuthContext = Depends(optional_client_auth),
):
    return _render_client_login(request, lang, auth=auth)


@app.get("/client/sonnik", response_class=HTMLResponse, include_in_schema=False)
async def client_sonnik(
    request: Request,
    lang: str = Query(default=""),
    auth: ClientAuthContext = Depends(optional_client_auth),
):
    return _render_client_page(request, "client_sonnik.html", lang, auth=auth)


@app.get("/client/numerology", response_class=HTMLResponse, include_in_schema=False)
async def client_numerology(
    request: Request,
    lang: str = Query(default=""),
    auth: ClientAuthContext = Depends(optional_client_auth),
):
    return _render_client_page(request, "client_numerology.html", lang, auth=auth)


@app.get("/client/compatibility", response_class=HTMLResponse, include_in_schema=False)
async def client_compatibility(
    request: Request,
    lang: str = Query(default=""),
    auth: ClientAuthContext = Depends(optional_client_auth),
):
    return _render_client_page(request, "client_compatibility.html", lang, auth=auth)


@app.get("/client/tarot", response_class=HTMLResponse, include_in_schema=False)
async def client_tarot(
    request: Request,
    lang: str = Query(default=""),
    auth: ClientAuthContext = Depends(optional_client_auth),
):
    return _render_client_page(request, "client_tarot.html", lang, auth=auth)


@app.get("/client/tarot/{topic}", response_class=HTMLResponse, include_in_schema=False)
async def client_tarot_topic(
    request: Request,
    topic: str,
    lang: str = Query(default=""),
    auth: ClientAuthContext = Depends(optional_client_auth),
):
    return _render_client_page(
        request,
        "client_tarot.html",
        lang,
        auth=auth,
        selected_card_topic=topic,
    )


@app.get("/client/tarot-cards", response_class=HTMLResponse, include_in_schema=False)
async def client_tarot_cards(
    request: Request,
    lang: str = Query(default=""),
    auth: ClientAuthContext = Depends(optional_client_auth),
):
    return _render_client_page(request, "client_tarot_cards.html", lang, auth=auth)


@app.get("/client/tarot-cards/report/{report_id}", response_class=HTMLResponse, include_in_schema=False)
async def client_tarot_cards_report(
    report_id: int,
    request: Request,
    lang: str = Query(default=""),
    auth: ClientAuthContext = Depends(optional_client_auth),
):
    return _render_client_page(
        request,
        "client_tarot_cards_report.html",
        lang,
        auth=auth,
        extra_context={"report_id": report_id},
    )


@app.get("/client/astrology", response_class=HTMLResponse, include_in_schema=False)
async def client_astrology(
    request: Request,
    lang: str = Query(default=""),
    auth: ClientAuthContext = Depends(optional_client_auth),
):
    return _render_client_page(request, "client_astrology.html", lang, auth=auth)


@app.get("/client/about/{service_slug}", response_class=HTMLResponse, include_in_schema=False)
async def client_service_about(
    request: Request,
    service_slug: str,
    lang: str = Query(default=""),
    back: str = Query(default=""),
    auth: ClientAuthContext = Depends(optional_client_auth),
):
    page_lang, _ = _resolve_page_lang(
        request,
        lang,
        _resolve_language(auth.email, auth.max, auth.telegram) if auth else "",
    )
    about = _service_about_page(service_slug, page_lang)
    about_context = {**about}
    about_context["back_url"] = _resolve_about_back_url(back, str(about.get("back_url") or "/client"))
    return _render_client_page(
        request,
        "client_service_about.html",
        lang,
        auth=auth,
        extra_context={"about": about_context},
    )


@app.get("/client/history", response_class=HTMLResponse, include_in_schema=False)
async def client_history(
    request: Request,
    lang: str = Query(default=""),
    auth: ClientAuthContext = Depends(optional_client_auth),
):
    return _render_client_page(request, "client_history.html", lang, auth=auth)


@app.get("/client/history/request/{request_id}", response_class=HTMLResponse, include_in_schema=False)
async def client_history_request_detail(
    request: Request,
    request_id: int,
    lang: str = Query(default=""),
    auth: ClientAuthContext = Depends(optional_client_auth),
):
    return _render_client_page(
        request,
        "client_history_request.html",
        lang,
        auth=auth,
        extra_context={"history_request_id": request_id},
    )


@app.get("/client/topup", response_class=HTMLResponse, include_in_schema=False)
async def client_topup(
    request: Request,
    lang: str = Query(default=""),
    auth: ClientAuthContext = Depends(optional_client_auth),
):
    return _render_client_page(request, "client_topup.html", lang, auth=auth)


@app.get("/client/profile", response_class=HTMLResponse, include_in_schema=False)
async def client_profile(
    request: Request,
    lang: str = Query(default=""),
    auth: str = Query(default=""),
    identities: ClientAuthContext = Depends(optional_client_auth),
):
    auth_mode = (auth or "").strip().lower()
    if auth_mode == "login":
        return _render_client_login(request, lang, auth=identities)
    if auth_mode in {"register", "signup"}:
        return _render_client_register(request, lang, auth=identities)
    return _render_client_page(request, "client_profile.html", lang, auth=identities)


@app.get("/client/support", response_class=HTMLResponse, include_in_schema=False)
async def client_support(
    request: Request,
    lang: str = Query(default=""),
    auth: ClientAuthContext = Depends(optional_client_auth),
):
    return _render_client_page(request, "client_support.html", lang, auth=auth)


@app.get("/client/lunar", include_in_schema=False)
async def client_lunar(request: Request, lang: str = Query(default="")):
    page_lang, set_cookie = _resolve_page_lang(request, lang)
    response = RedirectResponse(url="/client", status_code=302)
    if set_cookie:
        _set_lang_cookie(response, page_lang)
    return response


@app.get("/client/numerology/report/{report_id}", response_class=HTMLResponse, include_in_schema=False)
async def client_numerology_report(
    report_id: int,
    request: Request,
    lang: str = Query(default=""),
    auth: ClientAuthContext = Depends(optional_client_auth),
):
    return _render_client_page(
        request,
        "client_numerology_report.html",
        lang,
        auth=auth,
        extra_context={"report_id": report_id},
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
        if exc.status_code == 401:
            return RedirectResponse(url="/static/auth/login.html?next=/admin", status_code=302)
        raise
    page_lang, _ = _resolve_page_lang(request, lang)
    return templates.TemplateResponse(
        request=request,
        name="admin_dashboard.html",
        context=_client_template_context(request, page_lang),
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
    page_lang, set_cookie = _resolve_page_lang(request, lang)
    if _is_recognized_request(request, name=name, platform=platform):
        response = RedirectResponse(url=_client_url_with_query(name=name, platform=platform))
        if set_cookie:
            _set_lang_cookie(response, page_lang)
        return response

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
async def verify_auth(request: Request, identity: MaxIdentity = Depends(require_max_auth)):
    language = _sync_guest_lang_after_auth(request, identity.internal_user_id, identity.language)
    response = JSONResponse(
        content={
            "success": True,
            "profile": {
                "provider": "max",
                "provider_user_id": identity.user_id,
                "username": identity.username,
                "language": language,
            },
            "balance": get_balance(identity.internal_user_id),
        }
    )
    if language in {"ru", "en"}:
        _set_lang_cookie(response, language)
    return response


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
async def verify_telegram_auth(request: Request, payload: TelegramVerifyRequest):
    identity, is_new_user = resolve_telegram_identity(payload.init_data)
    language = _sync_guest_lang_after_auth(request, identity.internal_user_id, identity.language)
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
            "language": language,
        },
        "balance": get_balance(identity.internal_user_id),
    }
    response = JSONResponse(content=response_data)
    _set_telegram_auth_cookie(response, token)
    if language in {"ru", "en"}:
        _set_lang_cookie(response, language)
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
async def verify_telegram_username_link_post(request: Request, payload: TelegramLinkVerifyRequest):
    """
    Exchange a signed tglink=… token (see issue_telegram_username_login_url) for a session.
    The user must already exist with provider=telegram and matching username in the database
    (typically after a prior Mini App login that stored their @username).
    """
    identity = resolve_telegram_username_link_to_identity(payload.link_token)
    language = _sync_guest_lang_after_auth(request, identity.internal_user_id, identity.language)
    session_token = issue_telegram_auth_token(identity)
    response_data = {
        "success": True,
        "token": session_token,
        "profile": {
            "provider": "telegram",
            "provider_user_id": identity.user_id,
            "username": identity.username,
            "language": language,
        },
        "balance": get_balance(identity.internal_user_id),
    }
    response = JSONResponse(content=response_data)
    _set_telegram_auth_cookie(response, session_token)
    if language in {"ru", "en"}:
        _set_lang_cookie(response, language)
    return response


API_BUILD_ID = "75f8746-email-verify-v1"


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
        "smtp_configured": smtp_is_configured(),
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
async def api_email_register_start(request: Request, payload: EmailRegisterStartRequest):
    lang = _effective_auth_lang(request, payload.language)
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
        return _email_auth_response(identity, is_new_user=is_new_user, request=request)
    return await run_in_threadpool(
        start_email_registration,
        payload.email,
        payload.password,
        payload.password_confirm,
        lang,
    )


@app.post("/api/auth/email/register/resend")
async def api_email_register_resend(request: Request, payload: EmailResendRequest):
    lang = _effective_auth_lang(request, payload.language)
    return await run_in_threadpool(resend_registration_code, payload.email, lang)


@app.post("/api/auth/email/register/verify")
async def api_email_register_verify(request: Request, payload: EmailRegisterVerifyRequest):
    lang = _effective_auth_lang(request, payload.language)
    identity, is_new_user = await run_in_threadpool(
        verify_email_registration,
        payload.email,
        payload.code,
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
    return _email_auth_response(identity, is_new_user=is_new_user, request=request)


@app.post("/api/auth/email/login")
async def api_email_login(request: Request, payload: EmailLoginRequest):
    identity = await run_in_threadpool(login_email_user, payload.email, payload.password)
    return _email_auth_response(identity, request=request)


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


@app.patch("/api/profile/language")
async def api_update_profile_language(
    request: Request,
    payload: ProfileLanguageRequest,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    page_lang = _normalize_lang(payload.language)
    user_id = None
    if email_identity:
        user_id = email_identity.internal_user_id
    elif max_identity:
        user_id = max_identity.internal_user_id
    elif telegram_identity:
        user_id = telegram_identity.internal_user_id
    if user_id is not None:
        db.update_user_language(user_id, page_lang)
    response = JSONResponse({"success": True, "language": page_lang, "authenticated": user_id is not None})
    _set_lang_cookie(response, page_lang)
    return response


@app.get("/api/balance")
async def balance(
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    subscription = get_subscription_info(user_id)
    return {"balance": get_balance(user_id), **subscription}


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


@app.get("/api/history/requests/{request_id}")
async def api_request_history_detail(
    request_id: int,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    row = db.get_request_history_item(user_id=user_id, request_id=request_id)
    if not row:
        raise HTTPException(status_code=404, detail="History item not found")
    item = dict(row)
    report_id = _extract_numerology_report_id(item.get("output_text", ""))
    if item.get("module") == "numerology" and report_id:
        item["report_id"] = report_id
        item["report_url"] = f"/client/numerology/report/{report_id}"
    return {"success": True, "item": item}


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
async def payment_packages(for_sparks: int = Query(default=0, ge=0)):
    payload = {"success": True, "packages": payments.get_payment_packages(include_subscriptions=False)}
    if for_sparks > 0:
        payload["recommended_package_id"] = payments.recommend_package_for_sparks(for_sparks)
    return payload


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
    persona_context = _optional_persona_from_payload(user_id, payload)
    charge(user_id, settings.cost_sonnik, "sonnik", {"module": "sonnik"})
    try:
        interpretation = sonnik.interpret_dream(payload.dream_text, requested_language, persona_context)
    except HTTPException as exc:
        new_balance = refund(user_id, settings.cost_sonnik, "sonnik_refund", {"module": "sonnik"})
        return JSONResponse(status_code=exc.status_code, content={"error": _public_error_detail(exc, "sonnik", requested_language), "balance": new_balance})
    except Exception as exc:
        new_balance = refund(user_id, settings.cost_sonnik, "sonnik_refund", {"module": "sonnik"})
        return JSONResponse(status_code=502, content={"error": _service_failure_message("sonnik", requested_language), "balance": new_balance})

    persona_name = f"; persona={persona_context.get('name')}" if persona_context and persona_context.get("name") else ""
    db.record_history(user_id, "sonnik", f"{payload.dream_text}{persona_name}", interpretation)
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
    persona_context = _persona_context_from_values(
        user_id=user_id,
        persona_id=payload.persona_id,
        name=payload.persona_name or payload.full_name,
        birth_date=payload.persona_birth_date or payload.birth_date,
        birth_time=payload.persona_birth_time,
        birth_place=payload.persona_birth_place,
        note=payload.persona_note,
        required=True,
        require_birth_details=False,
    )
    full_name = persona_context["name"]
    birth_date = persona_context["birth_date"]
    charge(user_id, settings.cost_numerology, "numerology", {"module": "numerology"})
    try:
        report_payload = numerology.generate_web_report(full_name, birth_date, requested_language)
        report_payload["persona"] = {
            "name": persona_context.get("name") or "",
            "birth_date": persona_context.get("birth_date") or "",
            "birth_time": persona_context.get("birth_time") or "",
            "birth_place": persona_context.get("birth_place") or "",
            "note": persona_context.get("note") or "",
        }
    except HTTPException as exc:
        new_balance = refund(user_id, settings.cost_numerology, "numerology_refund", {"module": "numerology"})
        return JSONResponse(status_code=exc.status_code, content={"error": _public_error_detail(exc, "numerology", requested_language), "balance": new_balance})
    except Exception as exc:
        new_balance = refund(user_id, settings.cost_numerology, "numerology_refund", {"module": "numerology"})
        return JSONResponse(status_code=500, content={"error": _service_failure_message("numerology", requested_language), "balance": new_balance})

    report_id = db.record_html_report(
        user_id=user_id,
        module="numerology",
        title=f"Numerology: {full_name}",
        content_json=json.dumps(report_payload, ensure_ascii=False),
    )
    db.record_history(
        user_id,
        "numerology",
        f"{full_name};{birth_date}; persona={full_name}",
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
            persona1=persona1,
            persona2=persona2,
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
        "topics": tarot_cards.topic_options(requested_language),
        "spreads": tarot_cards.spread_options(requested_language),
    }


@app.post("/api/tarot-cards/draw")
async def api_tarot_cards_draw(payload: TarotCardDrawRequest):
    requested_language = _normalize_lang(payload.language)
    topic = payload.topic or payload.spread or "question"
    result = tarot_cards.draw_cards(topic, requested_language)
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
    topic = payload.topic or payload.spread or "question"
    try:
        selected_card_ids = tarot_cards.validate_draw_token(payload.draw_token, topic)
    except HTTPException as exc:
        return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail), "balance": get_balance(user_id)})
    persona_context = _optional_persona_from_payload(user_id, payload)
    charge(user_id, settings.cost_tarot_cards, "tarot_cards", {"module": "tarot_cards", "topic": topic})
    try:
        result = tarot_cards.tarot_card_reading(
            payload.question,
            topic,
            requested_language,
            selected_card_ids,
            persona=persona_context,
            partner_name=payload.partner_name,
            subtopic=payload.subtopic,
            topic=topic,
        )
    except HTTPException as exc:
        new_balance = refund(user_id, settings.cost_tarot_cards, "tarot_cards_refund", {"module": "tarot_cards"})
        return JSONResponse(status_code=exc.status_code, content={"error": _public_error_detail(exc, "reading", requested_language), "balance": new_balance})
    except Exception as exc:
        new_balance = refund(user_id, settings.cost_tarot_cards, "tarot_cards_refund", {"module": "tarot_cards"})
        return JSONResponse(status_code=502, content={"error": _service_failure_message("reading", requested_language), "balance": new_balance})

    cards_summary = ", ".join(card["name"] for card in result["cards"])
    persona_name = f"; persona={persona_context.get('name')}" if persona_context and persona_context.get("name") else ""
    input_text = f"{result['topic']['id']}; {cards_summary}{persona_name}; {payload.question.strip() or payload.subtopic or '-'}"
    report_id = db.record_html_report(
        user_id=user_id,
        module="tarot_cards",
        title=f"Tarot: {result['topic']['title']}",
        content_json=json.dumps(result, ensure_ascii=False),
    )
    db.record_history(user_id, "tarot_cards", input_text, result["interpretation"])
    return {
        "success": True,
        **result,
        "report_id": report_id,
        "report_url": f"/client/tarot-cards/report/{report_id}",
        "balance": get_balance(user_id),
    }


@app.get("/api/tarot-cards/report/{report_id}")
async def api_tarot_cards_report(
    report_id: int,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    row = db.get_html_report(report_id=report_id, user_id=user_id)
    if not row or row["module"] != "tarot_cards":
        raise HTTPException(status_code=404, detail="Report not found")
    try:
        payload = json.loads(row["content_json"] or "{}")
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Report is corrupted")
    return {"success": True, "report_id": report_id, **payload}


@app.post("/api/astrology/forecast")
async def api_astrology_forecast(
    payload: AstrologyForecastRequest,
    max_identity: MaxIdentity | None = Depends(optional_max_auth),
    telegram_identity: TelegramIdentity | None = Depends(optional_telegram_auth),
    email_identity: EmailIdentity | None = Depends(optional_email_auth),
):
    user_id, _provider = _require_authenticated_user(max_identity, telegram_identity, email_identity)
    requested_language = _normalize_lang(payload.language or _resolve_language(email_identity, max_identity, telegram_identity))
    persona_context = _persona_context_from_values(
        user_id=user_id,
        persona_id=payload.persona_id,
        name=payload.persona_name or payload.name,
        birth_date=payload.persona_birth_date or payload.birth_date,
        birth_time=payload.persona_birth_time or payload.birth_time,
        birth_place=payload.persona_birth_place or payload.birth_place,
        note=payload.persona_note,
        required=True,
    )
    name = persona_context["name"]
    birth_date = persona_context["birth_date"]
    birth_time = persona_context["birth_time"]
    birth_place = persona_context["birth_place"]
    charge(user_id, settings.cost_astrology, "astrology", {"module": "astrology"})
    try:
        result = divination.astrology_forecast(
            name,
            birth_date,
            birth_time,
            birth_place,
            payload.focus,
            requested_language,
            persona=persona_context,
        )
    except HTTPException as exc:
        new_balance = refund(user_id, settings.cost_astrology, "astrology_refund", {"module": "astrology"})
        return JSONResponse(status_code=exc.status_code, content={"error": _public_error_detail(exc, "astrology", requested_language), "balance": new_balance})
    except Exception as exc:
        new_balance = refund(user_id, settings.cost_astrology, "astrology_refund", {"module": "astrology"})
        return JSONResponse(status_code=502, content={"error": _service_failure_message("astrology", requested_language), "balance": new_balance})

    input_text = (
        f"{name}; {birth_date}; {birth_time or '-'}; "
        f"{birth_place or '-'}; persona={name}; {payload.focus or '-'}"
    )
    db.record_history(user_id, "astrology", input_text, result)
    return {"success": True, "result": result, "balance": get_balance(user_id)}
