"""Modular per-industry invoice fields (Phase 2 of the invoice rebuild).

A company picks its industry once (Settings > Industry / business type,
app_settings.industry). Each industry has a fixed, hand-picked list of
extra fields relevant to that business (e.g. veterinary needs the animal's
name and species, a pharmacy needs a prescription number). These are
stored as one JSON blob per invoice (invoices.industry_fields_json)
instead of dedicated columns per industry, so adding a new industry or
field is a code change here, never a migration.

Deliberately NOT a fully admin-configurable custom-field builder - the
request was for the ready-made vertical field sets (veterinary/human
medical/pharmacy), not a generic form designer, and building the latter
would be a much larger, differently-scoped feature.
"""
from fastapi import APIRouter

router = APIRouter(prefix="/api/industry-fields", tags=["Industry Fields"])

# type: "text" | "date" | "number"
INDUSTRY_FIELD_DEFINITIONS = {
    "general": [],
    "veterinary": [
        {"key": "animal_name", "type": "text", "required": True,
         "label": {"fa": "نام حیوان", "ar": "اسم الحيوان", "tr": "Hayvan adı", "en": "Animal name"}},
        {"key": "species", "type": "text", "required": True,
         "label": {"fa": "گونه", "ar": "النوع", "tr": "Tür", "en": "Species"}},
        {"key": "breed", "type": "text", "required": False,
         "label": {"fa": "نژاد", "ar": "السلالة", "tr": "Irk", "en": "Breed"}},
        {"key": "owner_name", "type": "text", "required": False,
         "label": {"fa": "نام صاحب حیوان", "ar": "اسم المالك", "tr": "Sahibinin adı", "en": "Owner name"}},
        {"key": "next_vaccination_date", "type": "date", "required": False,
         "label": {"fa": "تاریخ واکسیناسیون بعدی", "ar": "تاريخ التطعيم القادم", "tr": "Sonraki aşı tarihi", "en": "Next vaccination date"}},
    ],
    "human_medical": [
        {"key": "patient_name", "type": "text", "required": True,
         "label": {"fa": "نام بیمار", "ar": "اسم المريض", "tr": "Hasta adı", "en": "Patient name"}},
        {"key": "national_id", "type": "text", "required": False,
         "label": {"fa": "کد ملی بیمار", "ar": "الرقم الوطني للمريض", "tr": "Hasta kimlik no", "en": "Patient national ID"}},
        {"key": "insurance_number", "type": "text", "required": False,
         "label": {"fa": "شماره بیمه", "ar": "رقم التأمين", "tr": "Sigorta numarası", "en": "Insurance number"}},
        {"key": "referring_doctor", "type": "text", "required": False,
         "label": {"fa": "پزشک معالج/ارجاع‌دهنده", "ar": "الطبيب المُحيل", "tr": "Yönlendiren doktor", "en": "Referring doctor"}},
        {"key": "diagnosis", "type": "text", "required": False,
         "label": {"fa": "تشخیص", "ar": "التشخيص", "tr": "Tanı", "en": "Diagnosis"}},
    ],
    "pharmacy": [
        {"key": "prescription_number", "type": "text", "required": False,
         "label": {"fa": "شماره نسخه", "ar": "رقم الوصفة", "tr": "Reçete numarası", "en": "Prescription number"}},
        {"key": "prescribing_doctor", "type": "text", "required": False,
         "label": {"fa": "پزشک تجویزکننده", "ar": "الطبيب الواصف", "tr": "Reçeteyi yazan doktor", "en": "Prescribing doctor"}},
        {"key": "patient_name", "type": "text", "required": False,
         "label": {"fa": "نام بیمار", "ar": "اسم المريض", "tr": "Hasta adı", "en": "Patient name"}},
        {"key": "controlled_substance", "type": "text", "required": False,
         "label": {"fa": "داروی تحت کنترل (بله/خیر)", "ar": "دواء خاضع للرقابة (نعم/لا)", "tr": "Kontrollü ilaç (evet/hayır)", "en": "Controlled substance (yes/no)"}},
    ],
}

INDUSTRY_LABELS = {
    "general": {"fa": "عمومی", "ar": "عام", "tr": "Genel", "en": "General"},
    "veterinary": {"fa": "دامپزشکی", "ar": "بيطري", "tr": "Veterinerlik", "en": "Veterinary"},
    "human_medical": {"fa": "پزشکی انسانی", "ar": "طبي بشري", "tr": "İnsan sağlığı", "en": "Human medical"},
    "pharmacy": {"fa": "داروخانه", "ar": "صيدلية", "tr": "Eczane", "en": "Pharmacy"},
}


def fields_for_industry(industry: str) -> list:
    return INDUSTRY_FIELD_DEFINITIONS.get(industry, [])


def sanitize_industry_fields(industry: str, values: dict) -> dict:
    """Drops any key that isn't a defined field for this industry and
    coerces everything to a string - this is display/reference metadata
    stored alongside the invoice, never used in accounting math, so a
    permissive string cast is the right level of validation."""
    if not values:
        return {}
    allowed = {f["key"] for f in fields_for_industry(industry)}
    return {k: str(v) for k, v in values.items() if k in allowed and v not in (None, "")}


@router.get("/definitions")
def list_definitions():
    return {
        "industries": [
            {"key": key, "label": INDUSTRY_LABELS.get(key, {}), "fields": fields}
            for key, fields in INDUSTRY_FIELD_DEFINITIONS.items()
        ]
    }
