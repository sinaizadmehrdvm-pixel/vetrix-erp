from app.data_import import _mapping, _number, _row_key


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
