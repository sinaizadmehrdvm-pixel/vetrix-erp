from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_EVEN, ROUND_HALF_UP, ROUND_UP
from zoneinfo import ZoneInfo

_DIGITS = {
    "fa": str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"),
}
_ROUNDING = {
    "half_up": ROUND_HALF_UP,
    "half_even": ROUND_HALF_EVEN,
    "down": ROUND_DOWN,
    "up": ROUND_UP,
}


def get_value(source, key, default=None):
    if source is None:
        return default
    if isinstance(source, dict):
        return source.get(key, default)
    return getattr(source, key, default)


def localized_digits(value, language="en"):
    text = str(value)
    table = _DIGITS.get(language)
    return text.translate(table) if table else text


def _parse_datetime(value):
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day)
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        try:
            return datetime.strptime(text[:10], "%Y-%m-%d")
        except ValueError:
            return None


def _gregorian_to_jalali(gy, gm, gd):
    g_days = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
    gy2 = gy + 1 if gm > 2 else gy
    days = 355666 + 365 * gy + (gy2 + 3) // 4 - (gy2 + 99) // 100 + (gy2 + 399) // 400 + gd + g_days[gm - 1]
    jy = -1595 + 33 * (days // 12053)
    days %= 12053
    jy += 4 * (days // 1461)
    days %= 1461
    if days > 365:
        jy += (days - 1) // 365
        days = (days - 1) % 365
    if days < 186:
        jm, jd = 1 + days // 31, 1 + days % 31
    else:
        jm, jd = 7 + (days - 186) // 30, 1 + (days - 186) % 30
    return jy, jm, jd


def format_report_date(value, settings=None, language="en", include_time=False):
    parsed = _parse_datetime(value)
    if parsed is None:
        return "-"
    zone_name = str(get_value(settings, "time_zone", "UTC") or "UTC")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    try:
        parsed = parsed.astimezone(ZoneInfo(zone_name))
    except Exception:
        parsed = parsed.astimezone(timezone.utc)
    calendar = str(get_value(settings, "calendar_system", "gregorian") or "gregorian").lower()
    if calendar == "persian":
        year, month, day = _gregorian_to_jalali(parsed.year, parsed.month, parsed.day)
    else:
        year, month, day = parsed.year, parsed.month, parsed.day
    country = str(get_value(settings, "country_code", "") or "").upper()
    if language == "en" and country in {"US"} and calendar == "gregorian":
        result = f"{month:02d}/{day:02d}/{year:04d}"
    else:
        result = f"{year:04d}/{month:02d}/{day:02d}"
    if include_time:
        result += f" {parsed.hour:02d}:{parsed.minute:02d}"
    return localized_digits(result, language)


def quantize_money(value, settings=None):
    places = max(0, min(4, int(get_value(settings, "decimal_places", 2) or 0)))
    mode = str(get_value(settings, "rounding_mode", "half_up") or "half_up")
    quantum = Decimal("1").scaleb(-places)
    return Decimal(str(value or 0)).quantize(quantum, rounding=_ROUNDING.get(mode, ROUND_HALF_UP)), places


def format_report_money(value, settings=None, language="en"):
    amount, places = quantize_money(value, settings)
    number = f"{amount:,.{places}f}"
    code = str(get_value(settings, "currency_code", "") or get_value(settings, "currency", "") or "")
    text = f"{number} {code}".strip()
    return localized_digits(text, language)
