from app.data_import import (
    _guess_entity_for_headers,
    _mapping,
    _mapping_confidence,
    _number,
    _parse_csv_rows,
    _parse_date,
    _row_key,
)


def test_import_accepts_persian_and_english_headers():
    persian = _mapping(["نام طرف‌حساب", "موبایل", "مانده افتتاحیه"], "customers")
    assert persian["name"] == 0
    assert persian["phone"] == 1
    assert persian["opening_balance"] == 2
    english = _mapping(["name", "code", "buy_price", "stock"], "products")
    assert english == {"name": 0, "code": 1, "buy_price": 2, "stock": 3}


def test_import_duplicate_keys_prefer_stable_identifiers():
    assert _row_key("customers", {
        "name": "Acme", "phone": "1", "national_id": "N-10",
    }) == ("national", "n-10")
    assert _row_key("products", {
        "name": "Mask", "code": "P-10", "barcode": "123",
    }) == ("code", "p-10")
    assert _row_key("products", {
        "name": "Mask", "code": "", "barcode": "123",
    }) == ("barcode", "123")


def test_import_number_validation_rejects_invalid_and_negative_values():
    errors = []
    assert _number("1,234.5", "opening_balance", 2, errors) == 1234.5
    assert not errors
    assert _number("invalid", "stock", 3, errors) == 0
    assert errors[-1]["message"] == "Invalid number"
    assert _number("-1", "buy_price", 4, errors) == -1
    assert errors[-1]["message"] == "Value cannot be negative"


def test_import_negative_stock_is_policy_controlled_not_unconditionally_blocked():
    # Unlike buy_price/sell_price/etc., "stock" is deliberately excluded from
    # _number()'s always-non-negative set: the products import wizard makes
    # negative opening stock policy-controlled (negative_stock_policy:
    # block/warn) rather than a hard error baked into the shared numeric
    # parser, since some real-world migrations legitimately start from a
    # known shortfall.
    errors = []
    assert _number("-5", "stock", 1, errors) == -5
    assert not errors


def test_import_number_normalizes_persian_and_arabic_digits():
    # Real-world Persian/Arabic-locale spreadsheet exports commonly render
    # numeric columns with these glyphs, not ASCII digits - a spreadsheet
    # tool wouldn't reject them, so the importer shouldn't either.
    errors = []
    assert _number("۱۲۳۴", "opening_balance", 1, errors) == 1234
    assert not errors
    errors = []
    assert _number("١٢٣٤٫٥".replace("٫", "."), "opening_balance", 1, errors) == 1234.5
    assert not errors


def test_import_date_parses_jalali_and_normalizes_persian_digits():
    # Public, well-known reference date: Jalali 1403-01-01 = Gregorian 2024-03-20.
    assert _parse_date("1403/01/01").isoformat() == "2024-03-20"
    assert _parse_date("1403-01-01").isoformat() == "2024-03-20"
    # Persian-digit Jalali date should normalize the same way.
    assert _parse_date("۱۴۰۳/۰۱/۰۱").isoformat() == "2024-03-20"
    # Strict Gregorian keeps working unchanged.
    assert _parse_date("2024-03-20").isoformat() == "2024-03-20"
    # Garbage stays garbage - never silently guessed.
    assert _parse_date("not-a-date") is None


def test_import_mapping_confidence_is_rule_based_not_ai():
    result = _mapping_confidence(["name", "phone", "unrelated column"], "customers")
    assert result["name"]["confidence"] == 100
    assert result["name"]["column_index"] == 0
    assert result["phone"]["confidence"] == 100
    assert result["credit_limit"] is None

    fuzzy = _mapping_confidence(["Customer Phone Number"], "customers")
    assert fuzzy["phone"]["confidence"] == 60


def test_import_guess_entity_for_headers_scores_by_header_overlap():
    products_guess = _guess_entity_for_headers(["name", "code", "barcode", "buy_price", "sell_price"])
    assert products_guess["entity"] == "products"
    customers_guess = _guess_entity_for_headers(["name", "phone", "national_id", "credit_limit"])
    assert customers_guess["entity"] == "customers"
    assert _guess_entity_for_headers(["", "", ""]) is None


def test_import_employees_entity_mapping_and_duplicate_key():
    mapping = _mapping(["first_name", "last_name", "employee_number"], "employees")
    assert mapping == {"first_name": 0, "last_name": 1, "employee_number": 2}
    assert _row_key("employees", {"first_name": "Jane", "last_name": "Doe", "employee_number": "E-1"}) == ("employee_number", "e-1")
    assert _row_key("employees", {"first_name": "Jane", "last_name": "Doe", "employee_number": ""}) == ("name", "jane", "doe")


def test_import_parses_csv_rows():
    raw = "name,phone\nAcme Co,0912\n".encode("utf-8-sig")
    rows = _parse_csv_rows(raw)
    assert rows[0] == ("name", "phone")
    assert rows[1] == ("Acme Co", "0912")
