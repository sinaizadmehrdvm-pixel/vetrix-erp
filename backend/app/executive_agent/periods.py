"""Business date-period phrase resolution (Task 05).

Reuses the two already-verified Jalali<->Gregorian conversion functions
already in this codebase - app.export.localization._gregorian_to_jalali
(used by every report's date display) and app.data_import._jalali_to_gregorian
(added in Task 04, round-trip-verified against 4000 consecutive days) -
rather than re-deriving calendar math a third time. "This week" uses the
exact same Monday-start convention as main.py's own _week_start(), so an
agent answer about "this week" means the same thing the dashboard already
means by it.
"""
from datetime import date, timedelta

from app.data_import import _jalali_to_gregorian, _normalize_digits
from app.export.localization import _gregorian_to_jalali

PERSIAN_MONTHS = [
    "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
    "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
]

_TODAY_WORDS = {"امروز", "اليوم", "bugün", "today"}
_YESTERDAY_WORDS = {"دیروز", "ديروز", "أمس", "dün", "yesterday"}
_THIS_WEEK_WORDS = {"این هفته", "هذا الأسبوع", "bu hafta", "this week"}
_LAST_WEEK_WORDS = {"هفته قبل", "هفته گذشته", "الأسبوع الماضي", "geçen hafta", "last week"}
_THIS_MONTH_WORDS = {"این ماه", "هذا الشهر", "bu ay", "this month"}
_LAST_MONTH_WORDS = {"ماه قبل", "ماه گذشته", "الشهر الماضي", "geçen ay", "last month", "previous month"}
_THIS_QUARTER_WORDS = {"این فصل", "این سه‌ماهه", "هذا الربع", "bu çeyrek", "this quarter"}
_THIS_FISCAL_YEAR_WORDS = {"سال مالی جاری", "امسال", "هذه السنة المالية", "bu mali yıl", "this fiscal year", "this year"}


def _jalali_month_bounds(jy, jm):
    start = date(*_jalali_to_gregorian(jy, jm, 1))
    next_jy, next_jm = (jy + 1, 1) if jm == 12 else (jy, jm + 1)
    next_start = date(*_jalali_to_gregorian(next_jy, next_jm, 1))
    return start, next_start - timedelta(days=1)


def _jalali_quarter_bounds(jy, jm):
    quarter_start_month = ((jm - 1) // 3) * 3 + 1
    start = date(*_jalali_to_gregorian(jy, quarter_start_month, 1))
    end_month = quarter_start_month + 2
    next_jy, next_jm = (jy + 1, 1) if end_month == 12 else (jy, end_month + 1)
    next_start = date(*_jalali_to_gregorian(next_jy, next_jm, 1))
    return start, next_start - timedelta(days=1)


def _jalali_year_bounds(jy):
    start = date(*_jalali_to_gregorian(jy, 1, 1))
    next_start = date(*_jalali_to_gregorian(jy + 1, 1, 1))
    return start, next_start - timedelta(days=1)


def _clamp_end(start, end, today):
    """Never lets end_date fall before start_date - a period that hasn't
    started yet (e.g. an explicitly-requested future month) keeps its real,
    full range rather than being clamped to an inverted (end < start)
    result; only an ALREADY-STARTED period gets its end trimmed to today."""
    if start > today:
        return end
    return min(end, today)


def _week_bounds(today, weeks_back=0):
    start = today - timedelta(days=today.weekday() + weeks_back * 7)
    return start, start + timedelta(days=6)


def _find_persian_month(phrase_norm):
    for index, name in enumerate(PERSIAN_MONTHS):
        if name in phrase_norm:
            return index + 1
    return None


def _explicit_jalali_year(phrase_norm, default_year):
    import re
    match = re.search(r"1[234]\d{2}", phrase_norm)
    return int(match.group(0)) if match else default_year


def resolve_period(phrase, language="en", today=None):
    """Returns {start_date, end_date, label, calendar} for a recognized
    business date-period phrase, or None if the phrase isn't recognized -
    callers must treat None as "ask for clarification," never guess."""
    today = today or date.today()
    phrase_norm = _normalize_digits(str(phrase or "")).strip().lower()
    jy, jm, jd = _gregorian_to_jalali(today.year, today.month, today.day)

    if any(w in phrase_norm for w in _TODAY_WORDS):
        return {"start_date": today, "end_date": today, "label": "today", "calendar": "gregorian"}
    if any(w in phrase_norm for w in _YESTERDAY_WORDS):
        y = today - timedelta(days=1)
        return {"start_date": y, "end_date": y, "label": "yesterday", "calendar": "gregorian"}
    if any(w in phrase_norm for w in _LAST_WEEK_WORDS):
        start, end = _week_bounds(today, weeks_back=1)
        return {"start_date": start, "end_date": end, "label": "last_week", "calendar": "gregorian"}
    if any(w in phrase_norm for w in _THIS_WEEK_WORDS):
        start, end = _week_bounds(today, weeks_back=0)
        return {"start_date": start, "end_date": today, "label": "this_week", "calendar": "gregorian"}
    if any(w in phrase_norm for w in _LAST_MONTH_WORDS):
        prev_jy, prev_jm = (jy - 1, 12) if jm == 1 else (jy, jm - 1)
        start, end = _jalali_month_bounds(prev_jy, prev_jm)
        return {"start_date": start, "end_date": end, "label": "last_month", "calendar": "jalali", "jalali_year": prev_jy, "jalali_month": prev_jm}
    if any(w in phrase_norm for w in _THIS_MONTH_WORDS):
        start, end = _jalali_month_bounds(jy, jm)
        return {"start_date": start, "end_date": _clamp_end(start, end, today), "label": "this_month", "calendar": "jalali", "jalali_year": jy, "jalali_month": jm}
    if any(w in phrase_norm for w in _THIS_QUARTER_WORDS):
        start, end = _jalali_quarter_bounds(jy, jm)
        return {"start_date": start, "end_date": _clamp_end(start, end, today), "label": "this_quarter", "calendar": "jalali", "jalali_year": jy}
    if any(w in phrase_norm for w in _THIS_FISCAL_YEAR_WORDS):
        start, end = _jalali_year_bounds(jy)
        return {"start_date": start, "end_date": _clamp_end(start, end, today), "label": "this_fiscal_year", "calendar": "jalali", "jalali_year": jy}

    month_number = _find_persian_month(phrase_norm)
    if month_number:
        import re
        has_explicit_year = bool(re.search(r"1[234]\d{2}", phrase_norm))
        target_year = _explicit_jalali_year(phrase_norm, jy)
        if not has_explicit_year and month_number > jm:
            # A bare month name with no year, later in the calendar than the
            # current month (e.g. asking for "مهر" in Jalali month 5), means
            # the most recent occurrence of that month - last year's, not a
            # not-yet-arrived month in the current year.
            target_year -= 1
        start, end = _jalali_month_bounds(target_year, month_number)
        return {"start_date": start, "end_date": _clamp_end(start, end, today), "label": "named_month", "calendar": "jalali", "jalali_year": target_year, "jalali_month": month_number}

    return None


def format_period_label(period, language="en"):
    """Renders the interpreted period back to the user, per the task spec's
    own requirement that every period-bearing answer disclose exactly what
    range it used."""
    if not period:
        return ""
    if period["calendar"] == "jalali" and "jalali_month" in period:
        month_name = PERSIAN_MONTHS[period["jalali_month"] - 1]
        return f"{month_name} {period['jalali_year']} ({period['start_date'].isoformat()} .. {period['end_date'].isoformat()})"
    return f"{period['start_date'].isoformat()} .. {period['end_date'].isoformat()}"
