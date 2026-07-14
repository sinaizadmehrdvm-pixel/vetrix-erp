from datetime import datetime, timezone

from app.export.localization import (
    format_report_date,
    format_report_money,
    localized_digits,
    quantize_money,
)


def test_persian_calendar_and_digits_are_offline_and_deterministic():
    settings = {
        "calendar_system": "persian",
        "time_zone": "Asia/Tehran",
    }
    assert format_report_date(
        datetime(2026, 3, 21, 0, 0, tzinfo=timezone.utc),
        settings,
        "fa",
    ) == "۱۴۰۵/۰۱/۰۱"
    assert localized_digits("Invoice 120", "fa") == "Invoice ۱۲۰"


def test_country_date_order_and_company_time_zone():
    settings = {
        "calendar_system": "gregorian",
        "time_zone": "America/New_York",
        "country_code": "US",
    }
    value = datetime(2026, 1, 1, 2, 30, tzinfo=timezone.utc)
    assert format_report_date(value, settings, "en", include_time=True) == "12/31/2025 21:30"


def test_report_money_uses_verified_precision_rounding_and_currency():
    settings = {
        "decimal_places": 2,
        "rounding_mode": "half_even",
        "currency_code": "EUR",
    }
    assert format_report_money("12.345", settings, "en") == "12.34 EUR"
    assert format_report_money("12.355", settings, "en") == "12.36 EUR"
    amount, places = quantize_money("1.999", {
        "decimal_places": 0,
        "rounding_mode": "down",
    })
    assert str(amount) == "1"
    assert places == 0


def test_persian_money_keeps_numeric_policy_and_localizes_digits():
    settings = {
        "decimal_places": 0,
        "rounding_mode": "half_up",
        "currency_code": "IRR",
    }
    assert format_report_money("1234.5", settings, "fa") == "۱,۲۳۵ IRR"
