from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

from config import BASE_DIR


def _require_skyfield():
    try:
        from skyfield.api import Loader, wgs84
        from skyfield.framelib import ecliptic_frame
    except ImportError as exc:
        raise RuntimeError(
            "Natal chart dependencies are missing. Install: pip install skyfield geopy timezonefinder"
        ) from exc
    return Loader, wgs84, ecliptic_frame


ZODIAC_SIGNS = (
    "Aries",
    "Taurus",
    "Gemini",
    "Cancer",
    "Leo",
    "Virgo",
    "Libra",
    "Scorpio",
    "Sagittarius",
    "Capricorn",
    "Aquarius",
    "Pisces",
)

ZODIAC_SIGNS_RU = (
    "Овен",
    "Телец",
    "Близнецы",
    "Рак",
    "Лев",
    "Дева",
    "Весы",
    "Скорпион",
    "Стрелец",
    "Козерог",
    "Водолей",
    "Рыбы",
)

PLANETS = (
    ("sun", "Sun", "Солнце"),
    ("moon", "Moon", "Луна"),
    ("mercury", "Mercury", "Меркурий"),
    ("venus", "Venus", "Венера"),
    ("mars", "Mars", "Марс"),
    ("jupiter", "Jupiter", "Юпитер"),
    ("saturn", "Saturn", "Сатурн"),
    ("uranus", "Uranus", "Уран"),
    ("neptune", "Neptune", "Нептун"),
    ("pluto", "Pluto", "Плутон"),
)

MAJOR_ASPECTS = (
    (0, 8, "conjunction", "соединение"),
    (60, 6, "sextile", "секстиль"),
    (90, 7, "square", "квадрат"),
    (120, 7, "trine", "тригон"),
    (180, 8, "opposition", "оппозиция"),
)

EPHEMERIS_DIR = BASE_DIR / "data" / "ephemeris"
_DATE_RE = re.compile(r"^(\d{2})\.(\d{2})\.(\d{4})$")
_TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})$")


@dataclass(frozen=True)
class GeoPoint:
    latitude: float
    longitude: float
    label: str
    timezone: str


@dataclass(frozen=True)
class ChartPoint:
    key: str
    name_en: str
    name_ru: str
    longitude: float
    sign_index: int
    degree_in_sign: float
    house: int | None = None


def _normalize_lang(language: str) -> str:
    return "en" if (language or "").strip().lower() == "en" else "ru"


def parse_birth_date(value: str) -> tuple[int, int, int]:
    match = _DATE_RE.match((value or "").strip())
    if not match:
        raise ValueError("Invalid birth date")
    day, month, year = (int(match.group(1)), int(match.group(2)), int(match.group(3)))
    datetime(year, month, day)
    return year, month, day


def parse_birth_time(value: str) -> tuple[int, int]:
    match = _TIME_RE.match((value or "").strip())
    if not match:
        raise ValueError("Invalid birth time")
    hour, minute = int(match.group(1)), int(match.group(2))
    if hour > 23 or minute > 59:
        raise ValueError("Invalid birth time")
    return hour, minute


def _sign_index(longitude: float) -> int:
    return int(math.floor(_normalize_degrees(longitude) / 30.0)) % 12


def _degree_in_sign(longitude: float) -> float:
    return _normalize_degrees(longitude) % 30.0


def _normalize_degrees(value: float) -> float:
    return value % 360.0


def _angle_delta(left: float, right: float) -> float:
    delta = abs(_normalize_degrees(left) - _normalize_degrees(right)) % 360.0
    return min(delta, 360.0 - delta)


def _sign_name(sign_index: int, language: str) -> str:
    names = ZODIAC_SIGNS if language == "en" else ZODIAC_SIGNS_RU
    return names[sign_index % 12]


def _format_point(point: ChartPoint, language: str) -> str:
    sign = _sign_name(point.sign_index, language)
    name = point.name_en if language == "en" else point.name_ru
    degree = f"{point.degree_in_sign:05.2f}"
    house = ""
    if point.house:
        house = f", house {point.house}" if language == "en" else f", дом {point.house}"
    return f"{name}: {sign} {degree}°{house}"


@lru_cache(maxsize=1)
def _skyfield_loader():
    Loader, _wgs84, _ecliptic_frame = _require_skyfield()
    EPHEMERIS_DIR.mkdir(parents=True, exist_ok=True)
    return Loader(str(EPHEMERIS_DIR))


@lru_cache(maxsize=1)
def _ephemeris():
    load = _skyfield_loader()
    return load("de421.bsp")


@lru_cache(maxsize=1)
def _timescale():
    return _skyfield_loader().timescale()


def _wgs84():
    _Loader, wgs84, _ecliptic_frame = _require_skyfield()
    return wgs84


def _ecliptic_frame():
    _Loader, _wgs84_mod, ecliptic_frame = _require_skyfield()
    return ecliptic_frame


@lru_cache(maxsize=256)
def geocode_birth_place(place: str) -> GeoPoint | None:
    query = (place or "").strip()
    if not query:
        return None
    try:
        from geopy.geocoders import Nominatim
        from timezonefinder import TimezoneFinder
    except Exception:
        return None

    geolocator = Nominatim(user_agent="astrolhub-natal-chart/1.0", timeout=12)
    location = geolocator.geocode(query, language="en", exactly_one=True)
    if not location:
        return None
    timezone = TimezoneFinder().timezone_at(lat=location.latitude, lng=location.longitude) or "UTC"
    label = location.address or query
    return GeoPoint(
        latitude=float(location.latitude),
        longitude=float(location.longitude),
        label=label,
        timezone=timezone,
    )


def _obliquity_degrees(julian_day: float) -> float:
    t = (julian_day - 2451545.0) / 36525.0
    return 23.4392911 - (46.8150 * t + 0.00059 * t * t - 0.001813 * t * t * t) / 3600.0


def _ascendant_longitude(ramc_deg: float, latitude_deg: float, obliquity_deg: float) -> float:
    ramc = math.radians(ramc_deg)
    lat = math.radians(latitude_deg)
    eps = math.radians(obliquity_deg)
    y = -math.cos(ramc)
    x = math.sin(ramc) * math.cos(eps) + math.tan(lat) * math.sin(eps)
    if abs(x) < 1e-12 and abs(y) < 1e-12:
        return 0.0
    asc = math.degrees(math.atan2(y, x))
    return _normalize_degrees(asc)


def _mc_longitude(ramc_deg: float, obliquity_deg: float) -> float:
    ramc = math.radians(ramc_deg)
    eps = math.radians(obliquity_deg)
    y = math.sin(ramc)
    x = math.cos(ramc) * math.cos(eps)
    return _normalize_degrees(math.degrees(math.atan2(y, x)))


def _house_for_longitude(longitude: float, asc_longitude: float) -> int:
    relative = _normalize_degrees(longitude - asc_longitude)
    return int(math.floor(relative / 30.0)) + 1


def _planet_body(eph, key: str):
    if key == "sun":
        return eph["sun"]
    if key == "moon":
        return eph["moon"]
    if key == "earth":
        return eph["earth"]
    # de421 exposes barycenters for planets beyond Venus.
    return eph[f"{key} barycenter"]


def compute_natal_chart(
    *,
    name: str,
    birth_date: str,
    birth_time: str,
    birth_place: str,
) -> dict:
    year, month, day = parse_birth_date(birth_date)
    hour, minute = parse_birth_time(birth_time)
    geo = geocode_birth_place(birth_place)
    if not geo:
        raise ValueError("Could not resolve birth place")

    local_dt = datetime(year, month, day, hour, minute, tzinfo=ZoneInfo(geo.timezone))
    utc_dt = local_dt.astimezone(ZoneInfo("UTC"))
    ts = _timescale()
    t = ts.utc(
        utc_dt.year,
        utc_dt.month,
        utc_dt.day,
        utc_dt.hour,
        utc_dt.minute,
        utc_dt.second,
    )
    eph = _ephemeris()
    earth = eph["earth"]
    observer = earth + _wgs84().latlon(geo.latitude, geo.longitude)
    ecliptic_frame = _ecliptic_frame()

    points: list[ChartPoint] = []
    for key, name_en, name_ru in PLANETS:
        body = _planet_body(eph, key)
        lat, lon, _distance = observer.at(t).observe(body).apparent().frame_latlon(ecliptic_frame)
        longitude = float(lon.degrees)
        points.append(
            ChartPoint(
                key=key,
                name_en=name_en,
                name_ru=name_ru,
                longitude=longitude,
                sign_index=_sign_index(longitude),
                degree_in_sign=_degree_in_sign(longitude),
            )
        )

    gast_hours = float(t.gast)
    lst_hours = (gast_hours + geo.longitude / 15.0) % 24.0
    ramc = lst_hours * 15.0
    obliquity = _obliquity_degrees(float(t.tt))
    asc_lon = _ascendant_longitude(ramc, geo.latitude, obliquity)
    mc_lon = _mc_longitude(ramc, obliquity)

    angles = [
        ChartPoint("asc", "Ascendant", "Асцендент", asc_lon, _sign_index(asc_lon), _degree_in_sign(asc_lon), house=1),
        ChartPoint("mc", "Midheaven", "Середина неба (MC)", mc_lon, _sign_index(mc_lon), _degree_in_sign(mc_lon), house=10),
    ]

    points_with_houses = [
        ChartPoint(
            key=point.key,
            name_en=point.name_en,
            name_ru=point.name_ru,
            longitude=point.longitude,
            sign_index=point.sign_index,
            degree_in_sign=point.degree_in_sign,
            house=_house_for_longitude(point.longitude, asc_lon),
        )
        for point in points
    ]

    aspects = []
    for index, left in enumerate(points_with_houses):
        for right in points_with_houses[index + 1 :]:
            delta = _angle_delta(left.longitude, right.longitude)
            for angle, orb, name_en, name_ru in MAJOR_ASPECTS:
                if abs(delta - angle) <= orb:
                    aspects.append(
                        {
                            "left": left.key,
                            "right": right.key,
                            "aspect_en": name_en,
                            "aspect_ru": name_ru,
                            "orb": round(abs(delta - angle), 2),
                        }
                    )
                    break

    houses = []
    for house_number in range(1, 13):
        cusp = _normalize_degrees(asc_lon + (house_number - 1) * 30.0)
        houses.append(
            {
                "house": house_number,
                "longitude": round(cusp, 4),
                "sign_index": _sign_index(cusp),
                "degree_in_sign": round(_degree_in_sign(cusp), 2),
            }
        )

    return {
        "name": (name or "").strip() or "Native",
        "birth_date": birth_date.strip(),
        "birth_time": f"{hour:02d}:{minute:02d}",
        "birth_place": birth_place.strip(),
        "geo_label": geo.label,
        "latitude": round(geo.latitude, 5),
        "longitude": round(geo.longitude, 5),
        "timezone": geo.timezone,
        "house_system": "equal",
        "zodiac": "tropical",
        "points": points_with_houses,
        "angles": angles,
        "houses": houses,
        "aspects": aspects,
    }


def format_natal_chart_for_prompt(chart: dict | None, language: str = "ru") -> str:
    if not chart:
        return ""
    lang = _normalize_lang(language)
    points: list[ChartPoint] = chart["points"]
    angles: list[ChartPoint] = chart["angles"]
    aspects = chart.get("aspects") or []

    if lang == "en":
        lines = [
            "Computed natal chart (tropical zodiac, equal houses). Treat these values as ground truth.",
            f"Native: {chart['name']}",
            f"Birth: {chart['birth_date']} {chart['birth_time']} ({chart['timezone']})",
            f"Place: {chart['geo_label']} ({chart['latitude']}, {chart['longitude']})",
            "",
            "Angles:",
        ]
        lines.extend(f"- {_format_point(point, lang)}" for point in angles)
        lines.append("")
        lines.append("Planets:")
        lines.extend(f"- {_format_point(point, lang)}" for point in points)
        lines.append("")
        lines.append("Major aspects:")
        if aspects:
            name_map = {point.key: point.name_en for point in points}
            for aspect in aspects[:18]:
                lines.append(
                    f"- {name_map.get(aspect['left'], aspect['left'])} "
                    f"{aspect['aspect_en']} "
                    f"{name_map.get(aspect['right'], aspect['right'])} "
                    f"(orb {aspect['orb']}°)"
                )
        else:
            lines.append("- none within orb")
        lines.append("")
        lines.append("House cusps:")
        for house in chart["houses"]:
            lines.append(
                f"- House {house['house']}: {_sign_name(house['sign_index'], lang)} {house['degree_in_sign']:05.2f}°"
            )
        return "\n".join(lines)

    lines = [
        "Рассчитанная натальная карта (тропический зодиак, равные дома). Считай эти значения фактическими данными.",
        f"Уроженец: {chart['name']}",
        f"Рождение: {chart['birth_date']} {chart['birth_time']} ({chart['timezone']})",
        f"Место: {chart['geo_label']} ({chart['latitude']}, {chart['longitude']})",
        "",
        "Углы:",
    ]
    lines.extend(f"- {_format_point(point, lang)}" for point in angles)
    lines.append("")
    lines.append("Планеты:")
    lines.extend(f"- {_format_point(point, lang)}" for point in points)
    lines.append("")
    lines.append("Мажорные аспекты:")
    if aspects:
        name_map = {point.key: point.name_ru for point in points}
        for aspect in aspects[:18]:
            lines.append(
                f"- {name_map.get(aspect['left'], aspect['left'])} "
                f"{aspect['aspect_ru']} "
                f"{name_map.get(aspect['right'], aspect['right'])} "
                f"(орб {aspect['orb']}°)"
            )
    else:
        lines.append("- нет в пределах орба")
    lines.append("")
    lines.append("Куспиды домов:")
    for house in chart["houses"]:
        lines.append(
            f"- Дом {house['house']}: {_sign_name(house['sign_index'], lang)} {house['degree_in_sign']:05.2f}°"
        )
    return "\n".join(lines)


def build_natal_chart_from_persona(persona: dict | None) -> dict | None:
    if not persona:
        return None
    birth_date = (persona.get("birth_date") or "").strip()
    birth_time = (persona.get("birth_time") or "").strip()
    birth_place = (persona.get("birth_place") or "").strip()
    if not (birth_date and birth_time and birth_place):
        return None
    try:
        return compute_natal_chart(
            name=str(persona.get("name") or ""),
            birth_date=birth_date,
            birth_time=birth_time,
            birth_place=birth_place,
        )
    except Exception:
        return None
