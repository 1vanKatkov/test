from __future__ import annotations

import calendar
import math
from datetime import date


SYNODIC_MONTH = 29.53058867
KNOWN_NEW_MOON_JDN = 2451550.1  # 2000-01-06 18:14 UTC


def _julian_day(day: date) -> float:
    year = day.year
    month = day.month
    d = day.day
    if month <= 2:
        year -= 1
        month += 12
    a = year // 100
    b = 2 - a + (a // 4)
    return math.floor(365.25 * (year + 4716)) + math.floor(30.6001 * (month + 1)) + d + b - 1524.5


def _moon_age(day: date) -> float:
    days_since_new_moon = _julian_day(day) - KNOWN_NEW_MOON_JDN
    return days_since_new_moon % SYNODIC_MONTH


def _phase_info(day: date) -> dict:
    age = _moon_age(day)
    phase_fraction = age / SYNODIC_MONTH
    illumination = (1 - math.cos(2 * math.pi * phase_fraction)) / 2
    illumination_percent = round(illumination * 100, 1)

    if age < 1.84566:
        phase = "new_moon"
    elif age < 5.53699:
        phase = "waxing_crescent"
    elif age < 9.22831:
        phase = "first_quarter"
    elif age < 12.91963:
        phase = "waxing_gibbous"
    elif age < 16.61096:
        phase = "full_moon"
    elif age < 20.30228:
        phase = "waning_gibbous"
    elif age < 23.99361:
        phase = "last_quarter"
    elif age < 27.68493:
        phase = "waning_crescent"
    else:
        phase = "new_moon"

    advice = {
        "new_moon": "Start planning and set intentions.",
        "waxing_crescent": "Take small steps toward your goals.",
        "first_quarter": "Act decisively and remove blockers.",
        "waxing_gibbous": "Refine details and stay focused.",
        "full_moon": "Complete key tasks and reflect.",
        "waning_gibbous": "Share results and summarize progress.",
        "last_quarter": "Close unfinished tasks and simplify.",
        "waning_crescent": "Rest and prepare for a new cycle.",
    }
    return {
        "phase": phase,
        "age": round(age, 2),
        "illumination_percent": illumination_percent,
        "advice": advice[phase],
    }


def get_lunar_month(year: int, month: int) -> dict:
    _weekday, days_in_month = calendar.monthrange(year, month)
    days = []
    for day in range(1, days_in_month + 1):
        current = date(year, month, day)
        phase_info = _phase_info(current)
        days.append(
            {
                "date": current.isoformat(),
                "day": day,
                **phase_info,
            }
        )
    return {"year": year, "month": month, "days": days}
