import { useEffect, useState } from "react";
import { MessagesSquare, Save, KeyRound, Trash2, Copy } from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "../../localization/useLanguage";
import { toPersianDigits } from "../../localization/helpers";
import {
  getExecutiveAgentSettings, updateExecutiveAgentSettings, getExecutiveAgentCategories,
  createExecutiveAgentBindingCode, listExecutiveAgentTelegramBindings, revokeExecutiveAgentTelegramBinding,
  getBranches,
} from "../../services/api";
import Card from "../ui/Card";
import Button from "../ui/Button";
import Field from "../ui/Field";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "../ui/Table";
import Select from "../ui/Select";

const CATEGORY_LABELS = {
  summary: { fa: "خلاصه روزانه", ar: "الملخص اليومي", tr: "Günlük özet", en: "Daily summary" },
  sales: { fa: "فروش", ar: "المبيعات", tr: "Satış", en: "Sales" },
  cash: { fa: "جریان نقدی", ar: "التدفق النقدي", tr: "Nakit akışı", en: "Cash flow" },
  receivables: { fa: "مطالبات و بدهی‌ها", ar: "الذمم المدينة والدائنة", tr: "Alacak/borç", en: "Receivables & payables" },
  cheques: { fa: "چک‌ها", ar: "الشيكات", tr: "Çekler", en: "Cheques" },
  inventory: { fa: "موجودی انبار", ar: "المخزون", tr: "Envanter", en: "Inventory" },
  alerts: { fa: "هشدارهای اجرایی", ar: "التنبيهات التنفيذية", tr: "Yönetici uyarıları", en: "Executive alerts" },
  improvement: { fa: "برنامه‌های بهبود", ar: "خطط التحسين", tr: "İyileştirme planları", en: "Improvement plans" },
  budget: { fa: "بودجه", ar: "الميزانية", tr: "Bütçe", en: "Budget" },
  campaigns: { fa: "کمپین‌های آنلاین", ar: "الحملات عبر الإنترنت", tr: "Çevrimiçi kampanyalar", en: "Online campaigns" },
  customers: { fa: "مشتریان", ar: "العملاء", tr: "Müşteriler", en: "Customers" },
};

export default function ExecutiveAgentSettingsCard() {
  const { language, n, date } = useLanguage();
  const tr = (fa, ar, trText, en) => (language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? trText : en);
  const pd = (value) => (language === "fa" ? toPersianDigits(value) : value);

  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState(null);
  const [categories, setCategories] = useState([]);
  const [branches, setBranches] = useState([]);
  const [bindings, setBindings] = useState([]);
  const [saving, setSaving] = useState(false);
  const [generatedCode, setGeneratedCode] = useState(null);
  const [generating, setGenerating] = useState(false);

  async function load() {
    try {
      const [settingsData, categoriesData, branchesData, bindingsData] = await Promise.all([
        getExecutiveAgentSettings(), getExecutiveAgentCategories(), getBranches().catch(() => []), listExecutiveAgentTelegramBindings(),
      ]);
      setSettings(settingsData);
      setDraft({
        enabled: settingsData.enabled,
        default_branch_id: settingsData.default_branch_id,
        allowed_categories: settingsData.allowed_categories || [],
      });
      setCategories(categoriesData.categories || []);
      setBranches(Array.isArray(branchesData) ? branchesData : branchesData.items || []);
      setBindings(bindingsData.items || []);
    } catch (err) {
      toast.error(err.message);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, []);

  function toggleCategory(key) {
    setDraft((prev) => {
      const has = prev.allowed_categories.includes(key);
      return { ...prev, allowed_categories: has ? prev.allowed_categories.filter((c) => c !== key) : [...prev.allowed_categories, key] };
    });
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await updateExecutiveAgentSettings(draft);
      setSettings(updated);
      toast.success(tr("تنظیمات ذخیره شد.", "تم حفظ الإعدادات.", "Ayarlar kaydedildi.", "Settings saved."));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function generateCode() {
    setGenerating(true);
    try {
      const result = await createExecutiveAgentBindingCode();
      setGeneratedCode(result);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  }

  function copyCode() {
    if (!generatedCode) return;
    navigator.clipboard?.writeText(generatedCode.code);
    toast.success(tr("کد کپی شد.", "تم نسخ الرمز.", "Kod kopyalandı.", "Code copied."));
  }

  async function revokeBinding(id) {
    try {
      await revokeExecutiveAgentTelegramBinding(id);
      toast.success(tr("دسترسی لغو شد.", "تم إلغاء الربط.", "Bağlantı iptal edildi.", "Binding revoked."));
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (!settings || !draft) return null;

  return (
    <Card icon={MessagesSquare} title={tr("دستیار مدیریتی", "المساعد التنفيذي", "Yönetici Asistanı", "Executive Agent")}>
      <div className="flex flex-col gap-5">
        <label className="flex items-center gap-2 font-black">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))} />
          {tr("فعال‌سازی دستیار مدیریتی", "تفعيل المساعد التنفيذي", "Yönetici asistanını etkinleştir", "Enable the Executive Agent")}
        </label>

        <Field label={tr("شعبه پیش‌فرض (اختیاری)", "الفرع الافتراضي (اختياري)", "Varsayılan şube (isteğe bağlı)", "Default branch (optional)")}>
          <Select
            value={draft.default_branch_id ?? ""}
            onChange={(value) => setDraft((d) => ({ ...d, default_branch_id: value ? Number(value) : null }))}
            options={[
              { value: "", label: tr("بدون شعبه پیش‌فرض", "بدون فرع افتراضي", "Varsayılan şube yok", "No default branch") },
              ...branches.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
        </Field>

        <div>
          <p className="text-sm font-black mb-2">
            {tr("دسته‌های مجاز خارج از برنامه (تلگرام/واتس‌اپ)", "الفئات المسموح بها خارج التطبيق (تيليجرام/واتساب)", "Uygulama dışı izinli kategoriler (Telegram/WhatsApp)", "Categories allowed outside the app (Telegram/WhatsApp)")}
          </p>
          <p className="text-xs mb-3" style={{ color: "var(--erp-muted)" }}>
            {tr("این محدودیت فقط روی کانال‌های خارجی اعمال می‌شود؛ دسترسی داخل برنامه همیشه با نقش کاربر کنترل می‌شود.", "ينطبق هذا القيد فقط على القنوات الخارجية؛ الوصول داخل التطبيق يخضع دائماً لدور المستخدم.", "Bu kısıtlama yalnızca harici kanallar için geçerlidir; uygulama içi erişim her zaman kullanıcı rolüne göre kontrol edilir.", "This restriction applies only to external channels; in-app access is always controlled by the user's role.")}
          </p>
          <div className="flex flex-wrap gap-2">
            {categories.map((key) => (
              <label
                key={key}
                className="flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1.5 border cursor-pointer"
                style={{
                  borderColor: "var(--erp-border)",
                  background: draft.allowed_categories.includes(key) ? "var(--erp-glow)" : "var(--erp-panel-solid)",
                  color: draft.allowed_categories.includes(key) ? "var(--erp-accent)" : "var(--erp-text)",
                }}
              >
                <input type="checkbox" checked={draft.allowed_categories.includes(key)} onChange={() => toggleCategory(key)} className="hidden" />
                {CATEGORY_LABELS[key]?.[language] || key}
              </label>
            ))}
          </div>
        </div>

        <div>
          <Button icon={Save} loading={saving} onClick={save}>
            {tr("ذخیره تنظیمات", "حفظ الإعدادات", "Ayarları kaydet", "Save settings")}
          </Button>
        </div>

        <div className="pt-4 border-t border-[var(--erp-border)]">
          <p className="text-sm font-black mb-2">{tr("اتصال تلگرام", "ربط تيليجرام", "Telegram bağlantısı", "Telegram binding")}</p>
          <p className="text-xs mb-3" style={{ color: "var(--erp-muted)" }}>
            {tr("یک کد یک‌بارمصرف بسازید و آن را از طریق تلگرام برای ربات شرکت ارسال کنید تا هویت شما به این چت متصل شود.", "أنشئ رمزاً لمرة واحدة وأرسله عبر تيليجرام لبوت الشركة لربط هويتك بهذه المحادثة.", "Tek kullanımlık bir kod oluşturun ve şirket botuna Telegram üzerinden göndererek kimliğinizi bu sohbete bağlayın.", "Generate a one-time code and send it via Telegram to the company bot to bind your identity to that chat.")}
          </p>
          <div className="flex items-center gap-2 mb-3">
            <Button variant="secondary" size="sm" icon={KeyRound} loading={generating} onClick={generateCode}>
              {tr("ساخت کد اتصال", "إنشاء رمز الربط", "Bağlantı kodu oluştur", "Generate binding code")}
            </Button>
            {generatedCode ? (
              <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)" }}>
                {/* Not digit-localized on purpose: this code is typed
                    verbatim into Telegram and matched byte-exact against
                    what the backend generated - same exception class as
                    an API key. */}
                <span className="font-mono font-black tracking-wider">{generatedCode.code}</span>
                <button type="button" onClick={copyCode} className="text-[var(--erp-muted)] hover:text-[var(--erp-accent)]">
                  <Copy size={14} />
                </button>
                <span className="text-xs text-[var(--erp-muted)]">
                  {tr(`اعتبار ${n(generatedCode.expires_in_minutes)} دقیقه`, `صالح لمدة ${n(generatedCode.expires_in_minutes)} دقيقة`, `${n(generatedCode.expires_in_minutes)} dakika geçerli`, `Valid for ${n(generatedCode.expires_in_minutes)} minutes`)}
                </span>
              </div>
            ) : null}
          </div>

          <Table>
            <Thead>
              <Th className="w-12">{tr("ردیف", "#", "#", "#")}</Th>
              <Th>{tr("نام", "الاسم", "Ad", "Name")}</Th>
              <Th>{tr("تاریخ اتصال", "تاريخ الربط", "Bağlantı tarihi", "Bound at")}</Th>
              <Th></Th>
            </Thead>
            <Tbody>
              {bindings.length === 0 ? (
                <EmptyRow colSpan={4}>{tr("هیچ چت تلگرامی متصل نیست.", "لا توجد محادثة تيليجرام مرتبطة.", "Bağlı Telegram sohbeti yok.", "No Telegram chat bound yet.")}</EmptyRow>
              ) : (
                bindings.map((b, index) => (
                  <Tr key={b.id}>
                    <Td className="text-[var(--erp-muted)] font-bold">{n(index + 1)}</Td>
                    <Td>{pd(b.full_name)}</Td>
                    <Td className="text-[var(--erp-muted)]">{b.verified_at ? date(b.verified_at) : "—"}</Td>
                    <Td>
                      <Button variant="ghost" size="sm" icon={Trash2} onClick={() => revokeBinding(b.id)}>
                        {tr("لغو دسترسی", "إلغاء", "İptal et", "Revoke")}
                      </Button>
                    </Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>
        </div>
      </div>
    </Card>
  );
}
