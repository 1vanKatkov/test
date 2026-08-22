"""Build Astrolhub admin analytics PDF for Telegram /admin."""
from __future__ import annotations

import io
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.web.db import db


def _register_font() -> str:
    candidates = [
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/truetype/freefont/FreeSans.ttf"),
        Path(r"C:\Windows\Fonts\arial.ttf"),
        Path(r"C:\Windows\Fonts\segoeui.ttf"),
    ]
    for path in candidates:
        if path.exists():
            pdfmetrics.registerFont(TTFont("AdminSans", str(path)))
            return "AdminSans"
    return "Helvetica"


def _period_defaults(days: int = 30) -> tuple[str, str]:
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=max(days - 1, 0))
    return start.isoformat(), end.isoformat()


def _row(mapping) -> dict:
    if mapping is None:
        return {}
    if isinstance(mapping, dict):
        return mapping
    try:
        return dict(mapping)
    except Exception:  # noqa: BLE001
        return {}


def build_admin_stats_pdf(*, days: int = 30) -> bytes:
    db.init()
    font = _register_font()
    date_from, date_to = _period_defaults(days)
    overview = db.get_admin_overview_stats(date_from, date_to)
    modules = [_row(r) for r in db.get_admin_module_stats(date_from, date_to)]
    providers = [_row(r) for r in db.get_admin_provider_stats(date_from, date_to)]
    daily = [_row(r) for r in db.get_admin_daily_stats(date_from, date_to)]
    payments = [_row(r) for r in db.get_admin_payment_stats(date_from, date_to)]
    sparks = [_row(r) for r in db.get_admin_spark_stats(date_from, date_to)]
    top_users = [_row(r) for r in db.get_admin_top_users(date_from, date_to, limit=20)]
    users = [_row(r) for r in db.search_users("", limit=5000, offset=0)]

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "AdminTitle",
        parent=styles["Heading1"],
        fontName=font,
        fontSize=16,
        leading=20,
        spaceAfter=8,
    )
    h_style = ParagraphStyle(
        "AdminH",
        parent=styles["Heading2"],
        fontName=font,
        fontSize=12,
        leading=15,
        spaceBefore=10,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "AdminBody",
        parent=styles["Normal"],
        fontName=font,
        fontSize=9,
        leading=12,
    )

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm,
        title="Astrolhub admin stats",
    )
    story: list = []
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    story.append(Paragraph("Astrolhub — админ-статистика", title_style))
    story.append(Paragraph(f"Сформировано: {generated_at}", body_style))
    story.append(Paragraph(f"Период аналитики: {date_from} — {date_to}", body_style))
    story.append(Spacer(1, 6))

    story.append(Paragraph("Ключевые показатели", h_style))
    kpi_rows = [
        ["Метрика", "Значение"],
        ["Пользователи (всего)", overview.get("users_total", 0)],
        ["Уникальные посетители (всего)", overview.get("unique_visitors_total", 0)],
        ["Уникальные посетители (период)", overview.get("unique_visitors_period", 0)],
        ["Новые пользователи (период)", overview.get("new_users", 0)],
        ["Активные пользователи (период)", overview.get("active_users", 0)],
        ["Запросы (всего)", overview.get("requests_total", 0)],
        ["Запросы (период)", overview.get("period_requests", 0)],
        ["Платежи (всего)", overview.get("payments_total", 0)],
        ["Успешные платежи (всего)", overview.get("succeeded_payments", 0)],
        ["Успешные платежи (период)", overview.get("period_succeeded_payments", 0)],
        ["Выручка всего (коп./ед.)", overview.get("revenue_total", 0)],
        ["Выручка за период", overview.get("period_revenue", 0)],
        ["Искры списано (период)", overview.get("sparks_charged", 0)],
        ["Искры начислено (период)", overview.get("sparks_added", 0)],
        ["Открытые тикеты", overview.get("open_tickets", 0)],
    ]
    story.append(_table(kpi_rows, font, col_widths=[110 * mm, 55 * mm]))

    story.append(Paragraph("Модули (запросы за период)", h_style))
    module_rows = [["Модуль", "Запросов"]] + [[r.get("module", ""), r.get("total", 0)] for r in modules]
    if len(module_rows) == 1:
        module_rows.append(["—", 0])
    story.append(_table(module_rows, font, col_widths=[110 * mm, 55 * mm]))

    story.append(Paragraph("Источники регистрации (период)", h_style))
    provider_rows = [["Provider", "Пользователей"]] + [
        [r.get("provider", ""), r.get("total", 0)] for r in providers
    ]
    if len(provider_rows) == 1:
        provider_rows.append(["—", 0])
    story.append(_table(provider_rows, font, col_widths=[110 * mm, 55 * mm]))

    story.append(Paragraph("Топ пользователей по запросам", h_style))
    top_rows = [["ID", "Username", "Provider", "Запросы"]] + [
        [r.get("id", ""), r.get("username", "") or "—", r.get("provider", ""), r.get("requests_total", 0)]
        for r in top_users
    ]
    if len(top_rows) == 1:
        top_rows.append(["—", "—", "—", 0])
    story.append(_table(top_rows, font, col_widths=[22 * mm, 55 * mm, 35 * mm, 30 * mm]))

    story.append(Paragraph("Платежи по дням/статусам (период)", h_style))
    pay_rows = [["День", "Статус", "Кол-во", "Сумма"]] + [
        [r.get("day", ""), r.get("status", ""), r.get("total", 0), r.get("amount", 0)] for r in payments[:120]
    ]
    if len(pay_rows) == 1:
        pay_rows.append(["—", "—", 0, 0])
    story.append(_table(pay_rows, font, col_widths=[35 * mm, 40 * mm, 30 * mm, 40 * mm]))

    story.append(Paragraph("Движение искр (сводка, до 80 строк)", h_style))
    spark_rows = [["День", "Тип", "Причина", "Кол-во", "Сумма"]] + [
        [
            r.get("day", ""),
            r.get("type", ""),
            str(r.get("reason", "") or "")[:40],
            r.get("total", 0),
            r.get("amount", 0),
        ]
        for r in sparks[:80]
    ]
    if len(spark_rows) == 1:
        spark_rows.append(["—", "—", "—", 0, 0])
    story.append(_table(spark_rows, font, col_widths=[28 * mm, 28 * mm, 55 * mm, 22 * mm, 22 * mm]))

    story.append(Paragraph("Динамика по дням", h_style))
    daily_rows = [["День", "Новые", "Запросы", "Активные", "Выручка", "Визиты"]] + [
        [
            r.get("day", ""),
            r.get("new_users", 0),
            r.get("requests", 0),
            r.get("active_users", 0),
            r.get("revenue", 0),
            r.get("unique_visits", 0),
        ]
        for r in daily
    ]
    if len(daily_rows) == 1:
        daily_rows.append(["—", 0, 0, 0, 0, 0])
    story.append(_table(daily_rows, font, col_widths=[28 * mm, 22 * mm, 25 * mm, 25 * mm, 28 * mm, 25 * mm]))

    story.append(Paragraph(f"Пользователи сайта (всего в выгрузке: {len(users)})", h_style))
    user_rows = [["ID", "Provider", "Username / email", "Искры", "Роль", "Создан"]] + [
        [
            u.get("id", ""),
            u.get("provider", ""),
            str(u.get("username") or u.get("provider_user_id") or "")[:42],
            u.get("credits", 0),
            u.get("role", "user"),
            str(u.get("created_at") or "")[:19],
        ]
        for u in users
    ]
    if len(user_rows) == 1:
        user_rows.append(["—", "—", "—", 0, "—", "—"])
    story.append(_table(user_rows, font, col_widths=[16 * mm, 24 * mm, 55 * mm, 18 * mm, 18 * mm, 34 * mm], compact=True))

    doc.build(story)
    return buffer.getvalue()


def _table(rows: list[list], font: str, col_widths: list[float], *, compact: bool = False) -> Table:
    table = Table(rows, colWidths=col_widths, repeatRows=1)
    font_size = 7.5 if compact else 8.5
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), font),
                ("FONTSIZE", (0, 0), (-1, -1), font_size),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1c1533")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#f5f1ff")),
                ("TEXTCOLOR", (0, 1), (-1, -1), colors.HexColor("#1a1228")),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#f7f4ff")),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#c9bfd9")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3 if compact else 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3 if compact else 4),
            ]
        )
    )
    return table


def admin_pdf_filename() -> str:
    stamp = date.today().isoformat()
    return f"astrolhub-admin-{stamp}.pdf"
