from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage

from fastapi import HTTPException

from config import settings


logger = logging.getLogger(__name__)


def _smtp_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_from)


def _subject_for_purpose(purpose: str, lang: str) -> str:
    if purpose == "password_reset":
        return "Astrolhub password reset code" if lang == "en" else "Код сброса пароля Astrolhub"
    return "Astrolhub registration code" if lang == "en" else "Код подтверждения Astrolhub"


def _body_for_purpose(code: str, purpose: str, lang: str) -> str:
    if lang == "en":
        if purpose == "password_reset":
            return (
                f"Your password reset code: {code}\n\n"
                "The code is valid for a limited time. If you did not request this, ignore this email."
            )
        return (
            f"Your registration confirmation code: {code}\n\n"
            "Enter it on the verification page to finish creating your account."
        )
    if purpose == "password_reset":
        return (
            f"Код для сброса пароля: {code}\n\n"
            "Код действует ограниченное время. Если вы не запрашивали сброс, проигнорируйте письмо."
        )
    return (
        f"Код подтверждения регистрации: {code}\n\n"
        "Введите его на странице подтверждения, чтобы завершить создание аккаунта."
    )


def _connect_smtp():
    if not settings.smtp_host:
        raise HTTPException(status_code=503, detail="SMTP_HOST is not configured")
    timeout = 30
    use_ssl = settings.smtp_use_ssl or settings.smtp_port == 465
    if use_ssl:
        context = ssl.create_default_context()
        smtp = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=timeout, context=context)
        smtp.ehlo()
        return smtp
    smtp = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=timeout)
    smtp.ehlo()
    if settings.smtp_use_tls:
        context = ssl.create_default_context()
        smtp.starttls(context=context)
        smtp.ehlo()
    return smtp


def send_verification_email(to_email: str, code: str, purpose: str, lang: str = "ru") -> None:
    if not _smtp_configured():
        raise HTTPException(
            status_code=503,
            detail="Email delivery is not configured. Set SMTP_HOST and SMTP_FROM in .env",
        )
    if settings.smtp_user and not settings.smtp_password:
        raise HTTPException(status_code=503, detail="SMTP_PASSWORD is not configured")

    message = EmailMessage()
    message["Subject"] = _subject_for_purpose(purpose, lang)
    message["From"] = settings.smtp_from
    message["To"] = to_email
    message.set_content(_body_for_purpose(code, purpose, lang))

    try:
        with _connect_smtp() as smtp:
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)
        logger.info("Verification email sent to %s (purpose=%s)", to_email, purpose)
    except HTTPException:
        raise
    except smtplib.SMTPAuthenticationError as exc:
        logger.exception("SMTP authentication failed")
        raise HTTPException(
            status_code=502,
            detail="SMTP authentication failed. Check SMTP_USER, SMTP_PASSWORD, and SMTP_FROM.",
        ) from exc
    except Exception as exc:
        logger.exception("Failed to send verification email to %s", to_email)
        raise HTTPException(status_code=502, detail=f"Failed to send email: {exc}") from exc
