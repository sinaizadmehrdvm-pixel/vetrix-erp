import { useEffect, useState } from "react";
import { CreditCard, Save } from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "../../localization/useLanguage";
import { getPaymentProviders, savePaymentProvider } from "../../services/api";
import { translateApiError } from "../../localization/apiErrors";
import Card from "../ui/Card";
import Button from "../ui/Button";
import Field, { Input } from "../ui/Field";
import Select from "../ui/Select";

const PROVIDER_LABELS = {
  sandbox: { fa: "آزمایشی (Sandbox)", ar: "تجريبي (Sandbox)", tr: "Test (Sandbox)", en: "Sandbox (test)" },
  zarinpal: { fa: "زرین‌پال", ar: "زرين بال", tr: "ZarinPal", en: "ZarinPal" },
  pos_terminal_generic: { fa: "کارت‌خوان فروشگاهی (POS)", ar: "جهاز نقاط البيع (POS)", tr: "POS cihazı", en: "POS terminal" },
};

export default function PaymentProvidersCard() {
  const { language } = useLanguage();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) => (fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText);

  const [items, setItems] = useState([]);
  const [availableKeys, setAvailableKeys] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(null);

  async function load() {
    try {
      const data = await getPaymentProviders();
      setItems(data.items || []);
      setAvailableKeys(data.available_keys || []);
    } catch (err) {
      toast.error(translateApiError(err.message, language) || tr("خطا در دریافت اطلاعات درگاه‌ها", "خطأ في تحميل بوابات الدفع", "Ödeme sağlayıcıları yüklenemedi", "Failed to load payment providers"));
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draftFor(key) {
    const existing = items.find((i) => i.provider_key === key);
    return drafts[key] || {
      display_name: existing?.display_name || PROVIDER_LABELS[key]?.[language] || key,
      enabled: existing ? Boolean(existing.enabled) : false,
      mode: existing?.mode || "test",
      merchant_id: existing?.merchant_id || "",
      api_key: existing?.api_key || "",
    };
  }

  function setDraftField(key, field, value) {
    setDrafts((prev) => ({ ...prev, [key]: { ...draftFor(key), [field]: value } }));
  }

  async function save(key) {
    setSaving(key);
    try {
      await savePaymentProvider({ provider_key: key, ...draftFor(key) });
      toast.success(tr("ذخیره شد", "تم الحفظ", "Kaydedildi", "Saved"));
      setDrafts((prev) => { const next = { ...prev }; delete next[key]; return next; });
      await load();
    } catch (err) {
      toast.error(translateApiError(err.message, language) || tr("ذخیره ناموفق بود", "فشل الحفظ", "Kaydetme başarısız", "Save failed"));
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card icon={CreditCard} title={tr("درگاه‌ها و دستگاه‌های پرداخت", "بوابات وأجهزة الدفع", "Ödeme sağlayıcıları ve cihazları", "Payment gateways & devices")}>
      <p className="text-sm mb-4" style={{ color: "var(--erp-muted)" }}>
        {tr(
          "هر روش پرداخت را جدا فعال/غیرفعال و پیکربندی کنید. اطلاعات محرمانه فقط روی سرور شرکت شما نگهداری می‌شود.",
          "فعّل/عطّل واضبط كل طريقة دفع بشكل منفصل. تُحفظ البيانات السرية على خادم شركتك فقط.",
          "Her ödeme yöntemini ayrı ayrı etkinleştirin/devre dışı bırakın ve yapılandırın. Gizli bilgiler yalnızca şirketinizin sunucusunda saklanır.",
          "Enable/disable and configure each payment method separately. Secrets are stored only on your company's own server."
        )}
      </p>
      {(availableKeys.length ? availableKeys : Object.keys(PROVIDER_LABELS)).map((key) => {
        const draft = draftFor(key);
        const isPos = key === "pos_terminal_generic";
        return (
          <div key={key} className="rounded-2xl p-4 mb-3" style={{ background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)" }}>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <label className="flex items-center gap-2 font-black">
                <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraftField(key, "enabled", e.target.checked)} />
                {PROVIDER_LABELS[key]?.[language] || PROVIDER_LABELS[key]?.en || key}
              </label>
              <Button size="sm" icon={Save} loading={saving === key} onClick={() => save(key)}>
                {tr("ذخیره", "حفظ", "Kaydet", "Save")}
              </Button>
            </div>

            {isPos && (
              <p className="text-xs mb-3" style={{ color: "var(--erp-warning, #f59e0b)" }}>
                {tr(
                  "این بخش فقط اطلاعات دستگاه را ذخیره می‌کند؛ اتصال مستقیم به کارت‌خوان و شارژ خودکار هنوز پیاده‌سازی نشده و نیاز به یکپارچه‌سازی با SDK دستگاه دارد.",
                  "يحفظ هذا القسم بيانات الجهاز فقط؛ الاتصال المباشر بجهاز نقاط البيع والشحن التلقائي غير مطبق بعد ويتطلب دمج SDK الجهاز.",
                  "Bu bölüm yalnızca cihaz bilgilerini kaydeder; POS cihazına doğrudan bağlantı ve otomatik tahsilat henüz uygulanmadı, cihaz SDK entegrasyonu gerektirir.",
                  "This section only stores device info; direct terminal connection and automatic charging aren't implemented yet and need a device SDK integration."
                )}
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label={tr("نام نمایشی", "الاسم المعروض", "Görünen ad", "Display name")}>
                <Input value={draft.display_name} onChange={(e) => setDraftField(key, "display_name", e.target.value)} />
              </Field>
              <Field label={tr("محیط", "البيئة", "Ortam", "Environment")}>
                <Select
                  value={draft.mode}
                  onChange={(value) => setDraftField(key, "mode", value)}
                  options={[
                    { value: "test", label: tr("آزمایشی", "تجريبي", "Test", "Test") },
                    { value: "live", label: tr("واقعی", "حقيقي", "Canlı", "Live") },
                  ]}
                />
              </Field>
              <Field label={isPos ? tr("شناسه ترمینال", "معرّف الجهاز", "Terminal kimliği", "Terminal ID") : tr("شناسه پذیرنده (Merchant ID)", "معرّف التاجر", "Merchant ID", "Merchant ID")}>
                <Input value={draft.merchant_id} onChange={(e) => setDraftField(key, "merchant_id", e.target.value)} />
              </Field>
              {!isPos && (
                <Field label={tr("کلید API", "مفتاح API", "API anahtarı", "API key")}>
                  <Input value={draft.api_key} onChange={(e) => setDraftField(key, "api_key", e.target.value)} />
                </Field>
              )}
            </div>
          </div>
        );
      })}
    </Card>
  );
}
