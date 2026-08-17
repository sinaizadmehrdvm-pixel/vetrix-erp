import { useEffect, useMemo, useState } from "react";
import { ListTree, Layers, CheckCircle2, RefreshCw, Sparkles, Plus, ShieldCheck, ShieldOff, Trash2, Search } from "lucide-react";
import { getAccountingChart, getAccountingMeta, seedAccountingChart, createAccountingAccount, updateAccountingAccount, toggleAccountingAccount, deleteAccountingAccount } from "../services/accountingApi";
import { useLanguage } from "../localization/useLanguage";
import { confirmAction } from "../components/ui/confirmService";
import PageHeader from "../components/ui/PageHeader";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Tooltip from "../components/ui/Tooltip";
import Notice from "../components/ui/Notice";
import { Input, Textarea } from "../components/ui/Field";
import Select from "../components/ui/Select";
import StatsCard from "../widgets/StatsCard";
import Skeleton from "../components/ui/Skeleton";

const emptyForm = { code: "", name: "", account_type: "asset", level: "group", parent_id: "", normal_balance: "debit", description: "", color: "#22d3ee", is_active: true };
const types = ["asset", "liability", "equity", "revenue", "expense", "contra"];
const levels = ["group", "ledger", "subsidiary", "detail"];
const faType = { asset: "دارایی", liability: "بدهی", equity: "سرمایه", revenue: "درآمد", expense: "هزینه", contra: "کاهنده" };
const arType = { asset: "الأصول", liability: "الالتزامات", equity: "حقوق الملكية", revenue: "الإيرادات", expense: "المصروفات", contra: "حساب مقابل" };
const trType = { asset: "Varlıklar", liability: "Yükümlülükler", equity: "Özkaynaklar", revenue: "Gelir", expense: "Giderler", contra: "Düzenleyici Hesap" };
const faLevel = { group: "گروه", ledger: "کل", subsidiary: "معین", detail: "تفصیلی" };
const arLevel = { group: "مجموعة", ledger: "إجمالي", subsidiary: "فرعي", detail: "تفصيلي" };
const trLevel = { group: "Grup", ledger: "Ana Hesap", subsidiary: "Alt Hesap", detail: "Detay" };

function label(obj, key, language) {
  const map = language === "fa" ? obj.fa : language === "ar" ? obj.ar : language === "tr" ? obj.tr : null;
  return map ? (map[key] || key) : key;
}

export default function AccountingCore() {
  const { language, dir, n } = useLanguage();
  const tr = (fa, ar, trText, en) => (language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? trText : en);
  const [accounts, setAccounts] = useState([]);
  const [meta, setMeta] = useState({});
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState(null);
  const [q, setQ] = useState("");
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [chart, metaData] = await Promise.all([getAccountingChart(), getAccountingMeta().catch(() => ({}))]);
      setAccounts(Array.isArray(chart) ? chart : []);
      setMeta(metaData || {});
    } catch (e) {
      setMessage({ text: e.message || tr("خطای سرویس حسابداری", "خطأ في خدمة المحاسبة", "Muhasebe servisi hatası", "Accounting API error"), tone: "danger" });
    }
    finally { setLoading(false); }
  }
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [language]);

  const filtered = useMemo(() => accounts.filter(a => !q || String(a.code).includes(q) || String(a.name).toLowerCase().includes(q.toLowerCase())), [accounts, q]);
  const stats = { total: accounts.length, active: accounts.filter(a => a.is_active !== false && a.is_active !== 0).length };
  const accountTypes = meta.account_types || types, accountLevels = meta.levels || levels;
  function patch(k, v) { setForm(prev => ({ ...prev, [k]: v })); }
  function select(a) { setSelected(a); setForm({ ...emptyForm, ...a, parent_id: a.parent_id || "", is_active: a.is_active !== false && a.is_active !== 0 }); }
  function reset(parent) { setSelected(null); setForm({ ...emptyForm, parent_id: parent?.id || "", account_type: parent?.account_type || "asset" }); }
  async function save() {
    if (!form.code || !form.name) { setMessage({ text: tr("کد و نام الزامی است", "الرمز والاسم مطلوبان", "Kod ve ad zorunludur", "Code and name required"), tone: "danger" }); return; }
    const payload = { ...form, parent_id: form.parent_id ? Number(form.parent_id) : null, is_active: !!form.is_active };
    if (selected?.id) await updateAccountingAccount(selected.id, payload); else await createAccountingAccount(payload);
    setMessage({ text: tr("ذخیره شد", "تم الحفظ", "Kaydedildi", "Saved"), tone: "success" }); reset(); await load();
  }
  async function remove(id) {
    if (!(await confirmAction(tr("حساب حذف شود؟", "هل تريد حذف الحساب؟", "Hesap silinsin mi?", "Delete account?")))) return;
    await deleteAccountingAccount(id); await load();
  }
  async function toggle(id) { await toggleAccountingAccount(id); await load(); }
  async function seed() { await seedAccountingChart(); await load(); }

  const typeLabels = { fa: faType, ar: arType, tr: trType };
  const levelLabels = { fa: faLevel, ar: arLevel, tr: trLevel };

  return (
    <div dir={dir} className="space-y-5 text-[var(--erp-text)]">
      <PageHeader
        icon={ListTree}
        title={tr("کدینگ حساب‌ها", "دليل الحسابات", "Hesap Planı", "Chart of Accounts")}
        description={tr(
          "مدیریت کدینگ، سلسله‌مراتب و ماهیت حساب‌های دفتر کل",
          "إدارة الترميز والتسلسل الهرمي وطبيعة حسابات دفتر الأستاذ",
          "Hesap kodlaması, hiyerarşisi ve normal bakiyesinin yönetimi",
          "Manage account coding, hierarchy and normal balance"
        )}
        secondaryActions={
          <Button variant="secondary" icon={Sparkles} onClick={seed}>
            {tr("کدینگ پیش‌فرض", "الترميز الافتراضي", "Varsayılan Kodlama", "Seed defaults")}
          </Button>
        }
        primaryAction={
          <Button variant="secondary" icon={RefreshCw} loading={loading} onClick={load}>
            {tr("به‌روزرسانی", "تحديث", "Yenile", "Refresh")}
          </Button>
        }
      />

      {message && (
        <Notice tone={message.tone} className="mb-1">{message.text}</Notice>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatsCard title={tr("کل حساب‌ها", "الإجمالي", "Toplam", "Total accounts")} value={n(stats.total)} icon={<Layers />} color="var(--erp-accent)" />
        <StatsCard title={tr("فعال", "نشط", "Aktif", "Active")} value={n(stats.active)} icon={<CheckCircle2 />} color="var(--erp-success)" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
        <Card padding={false}>
          <div style={{ padding: 20 }}>
            <label className="vitalix-input-group flex items-center gap-2.5 mb-4" style={{ padding: "0 12px" }}>
              <Search size={16} aria-hidden="true" style={{ color: "var(--erp-accent)", flexShrink: 0 }} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={tr("جستجو در کد یا نام حساب...", "بحث بالرمز أو الاسم...", "Kod veya ada göre ara...", "Search by code or name...")}
                aria-label={tr("جستجوی حساب", "بحث الحساب", "Hesap ara", "Search accounts")}
                className="min-w-0 flex-1"
                style={{ color: "var(--erp-text)", padding: "10px 0" }}
              />
            </label>

            {/* Deliberate internal scroll region - the list can grow long,
                but the page itself shouldn't, per the "no unnecessary
                page-level scrolling" ask. Capped relative to the viewport
                (not just a flat px value) so it doesn't force the card
                taller than available space on short viewports. */}
            <div className="space-y-2" style={{ maxHeight: "min(620px, 60vh)", overflowY: "auto" }}>
              {loading && accounts.length === 0 ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} height={56} radius="var(--erp-radius-md)" />
                ))
              ) : filtered.length === 0 ? (
                <div className="text-center text-[var(--erp-muted)] text-sm" style={{ padding: "32px 0" }}>
                  {tr("حسابی یافت نشد.", "لا توجد حسابات.", "Hesap bulunamadı.", "No accounts found.")}
                </div>
              ) : (
                filtered.map((a) => (
                  <div
                    key={a.id}
                    className="erp-level-1 erp-table-row flex flex-wrap items-center justify-between gap-3 rounded-[var(--erp-radius-md)] px-4 py-2.5 transition-colors"
                    style={{ borderColor: selected?.id === a.id ? "var(--erp-accent)" : undefined }}
                  >
                    <button type="button" onClick={() => select(a)} className="flex-1 text-start bg-transparent border-0 p-0 cursor-pointer erp-focus" style={{ minWidth: 0 }}>
                      <div className="font-bold flex items-center gap-2 flex-wrap">
                        <span aria-hidden="true" style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: a.color || "var(--erp-accent)", flexShrink: 0 }} />
                        <span className="truncate">{a.code} — {a.name}</span>
                        {!a.is_active && (
                          <Badge tone="neutral">{tr("غیرفعال", "غير نشط", "Pasif", "Inactive")}</Badge>
                        )}
                      </div>
                      <div className="text-[var(--erp-muted)] flex items-center gap-1.5 flex-wrap" style={{ fontSize: 12, marginTop: 4 }}>
                        <span>{label(typeLabels, a.account_type, language)}</span>
                        <span>•</span>
                        <span>{label(levelLabels, a.level, language)}</span>
                        <span>•</span>
                        <span>{a.normal_balance === "debit" ? tr("بدهکار", "مدين", "Borç", "Debit") : tr("بستانکار", "دائن", "Alacak", "Credit")}</span>
                      </div>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Tooltip side="top" label={tr("افزودن زیرحساب", "إضافة حساب فرعي", "Alt hesap ekle", "Add sub-account")}>
                        <Button variant="secondary" size="sm" icon={Plus} aria-label={tr("افزودن زیرحساب", "إضافة حساب فرعي", "Alt hesap ekle", "Add sub-account")} onClick={() => reset(a)} />
                      </Tooltip>
                      <Tooltip side="top" label={a.is_active ? tr("غیرفعال کردن", "إلغاء التفعيل", "Devre dışı bırak", "Deactivate") : tr("فعال کردن", "تفعيل", "Etkinleştir", "Activate")}>
                        <Button
                          variant={a.is_active ? "secondary" : "success"}
                          size="sm"
                          icon={a.is_active ? ShieldOff : ShieldCheck}
                          aria-label={a.is_active ? tr("غیرفعال کردن", "إلغاء التفعيل", "Devre dışı bırak", "Deactivate") : tr("فعال کردن", "تفعيل", "Etkinleştir", "Activate")}
                          onClick={() => toggle(a.id)}
                        />
                      </Tooltip>
                      <Tooltip side="top" label={tr("حذف", "حذف", "Sil", "Delete")}>
                        <Button variant="danger" size="sm" icon={Trash2} aria-label={tr("حذف", "حذف", "Sil", "Delete")} onClick={() => remove(a.id)} />
                      </Tooltip>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>

        <Card title={selected ? tr("ویرایش حساب", "تعديل الحساب", "Hesabı düzenle", "Edit account") : tr("حساب جدید", "حساب جديد", "Yeni hesap", "New account")}>
          <div className="grid gap-3">
            <Input value={form.code} onChange={(e) => patch("code", e.target.value)} placeholder={tr("کد حساب", "رمز الحساب", "Hesap kodu", "Code")} />
            <Input value={form.name} onChange={(e) => patch("name", e.target.value)} placeholder={tr("نام حساب", "اسم الحساب", "Hesap adı", "Name")} />
            <Select
              value={form.account_type}
              onChange={(value) => patch("account_type", value)}
              options={accountTypes.map((t) => ({ value: t, label: label(typeLabels, t, language) }))}
            />
            <Select
              value={form.level}
              onChange={(value) => patch("level", value)}
              options={accountLevels.map((l) => ({ value: l, label: label(levelLabels, l, language) }))}
            />
            <Select
              value={form.parent_id}
              onChange={(value) => patch("parent_id", value)}
              options={[
                { value: "", label: tr("بدون والد", "بدون حساب أب", "Üst hesap yok", "No parent") },
                ...accounts.filter((a) => a.id !== selected?.id).map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` })),
              ]}
            />
            <Select
              value={form.normal_balance}
              onChange={(value) => patch("normal_balance", value)}
              options={[
                { value: "debit", label: tr("بدهکار", "مدين", "Borç", "Debit") },
                { value: "credit", label: tr("بستانکار", "دائن", "Alacak", "Credit") },
              ]}
            />
            <label className="flex items-center gap-3">
              <span className="text-sm text-[var(--erp-muted)] shrink-0">{tr("رنگ", "اللون", "Renk", "Color")}</span>
              <input
                type="color"
                value={form.color}
                onChange={(e) => patch("color", e.target.value)}
                className="vitalix-control-inset"
                style={{ width: "100%", height: 44, padding: 4, borderRadius: "var(--erp-radius-sm)", borderColor: "var(--erp-border)" }}
              />
            </label>
            <Textarea rows={3} value={form.description} onChange={(e) => patch("description", e.target.value)} placeholder={tr("توضیحات", "الوصف", "Açıklama", "Description")} />
            <label className="flex items-center justify-between erp-level-1 rounded-[var(--erp-radius-sm)]" style={{ padding: "10px 12px" }}>
              <span className="font-bold text-sm">{tr("فعال", "نشط", "Aktif", "Active")}</span>
              <input type="checkbox" checked={!!form.is_active} onChange={(e) => patch("is_active", e.target.checked)} />
            </label>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button onClick={save}>{tr("ذخیره", "حفظ", "Kaydet", "Save")}</Button>
              <Button variant="secondary" onClick={() => reset()}>{tr("جدید", "جديد", "Yeni", "New")}</Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
