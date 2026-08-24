import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, RefreshCw, Settings2, ShieldAlert } from "lucide-react";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, cleanNumberInput } from "../localization/helpers";
import { getExecutiveAlertsSummary, getExecutiveAlertSettings, updateExecutiveAlertSettings } from "../services/api";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "../components/ui/Table";
import Select from "../components/ui/Select";

const cardClass = "rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-panel)] p-5";
const inputClass = "w-full p-3 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] outline-none focus:ring-2 focus:ring-cyan-400";

const SEVERITY_TONE = {
  critical: "bg-red-500/15 text-red-200",
  warning: "bg-amber-500/15 text-amber-200",
  info: "bg-cyan-500/15 text-cyan-200",
};

export default function ExecutiveAlerts() {
  const { dir, language, money, n, date } = useLanguage();
  const tr = (fa, ar, trText, en) => (language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? trText : en);
  const pd = (value) => (language === "fa" ? toPersianDigits(value) : value);

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState({ alert_days_before_due: 3, minimum_receivable_amount: 0 });
  const [savingSettings, setSavingSettings] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [summaryData, settingsData] = await Promise.all([getExecutiveAlertsSummary(), getExecutiveAlertSettings()]);
      setSummary(summaryData);
      setSettingsDraft(settingsData);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, []);

  const categoryLabel = (c) => ({
    receivable: tr("مطالبات", "مستحقات", "Alacaklar", "Receivable"),
    payable: tr("بدهی‌ها", "مدفوعات مستحقة", "Borçlar", "Payable"),
    cheque_in: tr("چک دریافتنی", "شيك وارد", "Alınan çek", "Incoming cheque"),
    cheque_out: tr("چک پرداختنی", "شيك صادر", "Verilen çek", "Outgoing cheque"),
    low_stock: tr("کمبود موجودی", "نقص المخزون", "Düşük stok", "Low stock"),
  }[c] || c);

  const severityLabel = (s) => ({
    critical: tr("بحرانی", "حرج", "Kritik", "Critical"),
    warning: tr("هشدار", "تحذير", "Uyarı", "Warning"),
    info: tr("اطلاعی", "معلوماتي", "Bilgi", "Info"),
  }[s] || s);

  function quickActionLink(item) {
    switch (item.quick_action) {
      case "record_payment":
      case "view_receivable":
        return item.related_type === "customer" ? `/customers/${item.related_id}` : null;
      case "open_cheque":
        return "/treasury-cheques";
      case "view_stock":
        return "/warehouse";
      case "create_purchase_order":
        return "/purchase-orders";
      case "view_budget_control":
        return "/budget-control";
      default:
        return null;
    }
  }

  const quickActionLabel = (item) => ({
    record_payment: tr("ثبت دریافت", "تسجيل تحصيل", "Tahsilat kaydet", "Record payment"),
    view_receivable: tr("مشاهده", "عرض", "Görüntüle", "View"),
    open_cheque: tr("مشاهده چک", "عرض الشيك", "Çeki görüntüle", "View cheque"),
    view_stock: tr("مشاهده موجودی", "عرض المخزون", "Stoku görüntüle", "View stock"),
    create_purchase_order: tr("سفارش خرید", "أمر شراء", "Satın alma siparişi", "Purchase order"),
    view_budget_control: tr("مشاهده بودجه", "عرض الموازنة", "Bütçeyi görüntüle", "View budget"),
  }[item.quick_action] || tr("مشاهده", "عرض", "Görüntüle", "View"));

  const filteredItems = (summary?.items || []).filter((item) => {
    if (categoryFilter && item.category !== categoryFilter) return false;
    if (severityFilter && item.severity !== severityFilter) return false;
    return true;
  });

  async function saveSettings(event) {
    event.preventDefault();
    setSavingSettings(true);
    try {
      await updateExecutiveAlertSettings({
        alert_days_before_due: Number(settingsDraft.alert_days_before_due) || 0,
        minimum_receivable_amount: Number(settingsDraft.minimum_receivable_amount) || 0,
      });
      toast.success(tr("تنظیمات ذخیره شد.", "تم حفظ الإعدادات.", "Ayarlar kaydedildi.", "Settings saved."));
      setSettingsOpen(false);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <div dir={dir} className="p-4 md:p-6 space-y-6 text-[var(--erp-text)]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black flex items-center gap-2">
          <ShieldAlert className="text-[var(--erp-accent)]" />
          {tr("مرکز هشدارهای مدیریتی", "مركز التنبيهات التنفيذية", "Yönetici uyarı merkezi", "Executive Alerts Center")}
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)]" title={tr("به‌روزرسانی", "تحديث", "Yenile", "Refresh")}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button onClick={() => setSettingsOpen((v) => !v)} className="p-2 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)]" title={tr("تنظیمات آستانه", "إعدادات العتبة", "Eşik ayarları", "Threshold settings")}>
            <Settings2 size={16} />
          </button>
        </div>
      </header>

      {settingsOpen && (
        <section className={cardClass}>
          <form onSubmit={saveSettings} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <label className="text-sm">
              <span className="block mb-1 text-[var(--erp-muted)]">{tr("روز هشدار پیش از سررسید", "أيام التنبيه قبل الاستحقاق", "Vade öncesi uyarı günü", "Days before due to alert")}</span>
              {/* `type="text" inputMode="numeric"` (not `type="number"`) -
                  native number inputs always render Latin digits, browsers
                  give them no way to show localized glyphs. Same
                  display-format-only / parse-back-to-normalized-number
                  pattern used throughout the app: `pd()` for display,
                  `cleanNumberInput()` strips back to a plain digit string
                  on change, so the stored/submitted value is unaffected. */}
              <input type="text" inputMode="numeric" className={inputClass} value={pd(settingsDraft.alert_days_before_due)} onChange={(e) => setSettingsDraft({ ...settingsDraft, alert_days_before_due: cleanNumberInput(e.target.value) })} />
            </label>
            <label className="text-sm">
              <span className="block mb-1 text-[var(--erp-muted)]">{tr("حداقل مبلغ مطالبه برای هشدار", "الحد الأدنى للمبلغ المستحق للتنبيه", "Uyarı için asgari alacak tutarı", "Minimum receivable amount to alert")}</span>
              <input type="text" inputMode="numeric" className={inputClass} value={pd(settingsDraft.minimum_receivable_amount)} onChange={(e) => setSettingsDraft({ ...settingsDraft, minimum_receivable_amount: cleanNumberInput(e.target.value) })} />
            </label>
            <button type="submit" disabled={savingSettings} className="rounded-xl bg-[var(--erp-accent)] text-black font-black px-4 py-3 disabled:opacity-60">
              {savingSettings ? tr("در حال ذخیره...", "جارٍ الحفظ...", "Kaydediliyor...", "Saving...") : tr("ذخیره تنظیمات", "حفظ الإعدادات", "Ayarları kaydet", "Save settings")}
            </button>
          </form>
        </section>
      )}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className={cardClass}>
            <div className="text-xs text-[var(--erp-muted)]">{tr("بحرانی", "حرج", "Kritik", "Critical")}</div>
            <div className="text-2xl font-black text-red-300">{n(summary.counts.critical)}</div>
          </div>
          <div className={cardClass}>
            <div className="text-xs text-[var(--erp-muted)]">{tr("هشدار", "تحذير", "Uyarı", "Warning")}</div>
            <div className="text-2xl font-black text-amber-300">{n(summary.counts.warning)}</div>
          </div>
          <div className={cardClass}>
            <div className="text-xs text-[var(--erp-muted)]">{tr("اطلاعی", "معلوماتي", "Bilgi", "Info")}</div>
            <div className="text-2xl font-black text-cyan-300">{n(summary.counts.info)}</div>
          </div>
          <div className={cardClass}>
            <div className="text-xs text-[var(--erp-muted)]">{tr("مجموع مواجهه مالی", "إجمالي التعرض المالي", "Toplam finansal risk", "Total financial exposure")}</div>
            <div className="text-2xl font-black text-[var(--erp-accent)]">{money(summary.total_financial_exposure)}</div>
          </div>
        </div>
      )}

      <section className={cardClass}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <Select
            className="w-full"
            value={categoryFilter}
            onChange={(value) => setCategoryFilter(value)}
            options={[
              { value: "", label: tr("همه دسته‌ها", "كل الفئات", "Tüm kategoriler", "All categories") },
              ...["receivable", "payable", "cheque_in", "cheque_out", "low_stock"].map((c) => ({ value: c, label: categoryLabel(c) })),
            ]}
          />
          <Select
            className="w-full"
            value={severityFilter}
            onChange={(value) => setSeverityFilter(value)}
            options={[
              { value: "", label: tr("همه سطوح", "كل المستويات", "Tüm seviyeler", "All severities") },
              ...["critical", "warning", "info"].map((s) => ({ value: s, label: severityLabel(s) })),
            ]}
          />
        </div>

        {loading ? (
          <p className="text-[var(--erp-muted)]">{tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}</p>
        ) : (
          <Table>
            <Thead>
              <Th>#</Th>
              <Th>{tr("دسته", "الفئة", "Kategori", "Category")}</Th>
              <Th>{tr("عنوان", "العنوان", "Başlık", "Title")}</Th>
              <Th>{tr("مبلغ", "المبلغ", "Tutar", "Amount")}</Th>
              <Th>{tr("سررسید", "الاستحقاق", "Vade", "Due date")}</Th>
              <Th>{tr("سطح", "المستوى", "Seviye", "Severity")}</Th>
              <Th align="end">{tr("اقدام سریع", "إجراء سريع", "Hızlı işlem", "Quick action")}</Th>
            </Thead>
            <Tbody>
              {filteredItems.length === 0 ? (
                <EmptyRow colSpan={7}>{tr("موردی یافت نشد.", "لا توجد عناصر.", "Öğe bulunamadı.", "No items found.")}</EmptyRow>
              ) : filteredItems.map((item, index) => {
                const link = quickActionLink(item);
                return (
                  <Tr key={`${item.category}-${item.related_id}-${index}`}>
                    <Td className="text-[var(--erp-muted)] font-bold">{n(index + 1)}</Td>
                    <Td>{categoryLabel(item.category)}</Td>
                    <Td className="font-bold">{item.title}</Td>
                    <Td>{item.amount ? money(item.amount) : "—"}</Td>
                    <Td>{item.due_date ? date(item.due_date) : "—"}</Td>
                    <Td><span className={`px-2 py-1 rounded-lg text-xs font-black ${SEVERITY_TONE[item.severity] || ""}`}>{severityLabel(item.severity)}</span></Td>
                    <Td align="end">
                      {link ? (
                        <Link to={link} className="text-sm font-bold text-[var(--erp-accent)]">{quickActionLabel(item)}</Link>
                      ) : (
                        <span className="text-sm text-[var(--erp-muted)]">—</span>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        )}
      </section>

      {summary && summary.counts.total === 0 && (
        <div className={cardClass + " text-center text-[var(--erp-muted)] flex items-center justify-center gap-2"}>
          <AlertTriangle size={16} />
          {tr("در حال حاضر مورد بحرانی یا هشداری وجود ندارد.", "لا توجد حاليًا عناصر حرجة أو تحذيرية.", "Şu anda kritik veya uyarı öğesi yok.", "No critical or warning items right now.")}
        </div>
      )}
    </div>
  );
}
