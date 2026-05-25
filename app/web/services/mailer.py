from __future__ import annotations

import smtplib
from email.message import EmailMessage

from fastapi import HTTPException

from config import settings


def _smtp_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_from)


def _subject_for_purpose(purpose: str, lang: str) -> str:
    if purpose == "password_reset":
        return "Astrolhub password reset code" if lang == "en" else "Код сброса пароля Astrolhub"
    return "Astrolhub registration code" if lang == "en" else "Код регистрации Astrolhub"


def _body_for_purpose(code: str, purpose: str, lang: str) -> str:
    if lang == "en":
        if purpose == "password_reset":
            return (
                f"Your password reset code: {code}\n\n"
                "The code is valid for a limited time. If you did not request this, ignore this email."
            )
        return (
            f"Your registration confirmation code: {code}\n\n"
            "Enter it in the app to finish creating your account."
        )
    if purpose == "password_reset":
        return (
            f"Код для сброса пароля: {code}\n\n"
            "Код действует ограниченное время. Если вы не запрашивали сброс, проигнорируйте письмо."
        )
    return (
        f"Код подтверждения регистрации: {code}\n\n"
        "Введите его в приложении, чтобы завершить создание аккаунта."
    )


def send_verification_email(to_email: str, code: str, purpose: str, lang: str = "ru") -> None:
    if not _smtp_configured():
        raise HTTPException(status_code=503, detail="Email delivery is not configured (SMTP)")

    message = EmailMessage()
    message["Subject"] = _subject_for_purpose(purpose, lang)
    message["From"] = settings.smtp_from
    message["To"] = to_email
    message.set_content(_body_for_purpose(code, purpose, lang))

    try:
        if settings.smtp_use_tls:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
                smtp.ehlo()
                smtp.starttls()
                smtp.ehlo()
                if settings.smtp_user:
                    smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
                if settings.smtp_user:
                    smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(message)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to send email: {exc}") from exc
