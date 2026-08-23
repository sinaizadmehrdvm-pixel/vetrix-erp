import {
  BellRing,
  CalendarClock,
  CreditCard,
  FileText,
  Gift,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatCalendarDate } from "../../../utils/date";
import { toPersianDigits } from "../../../localization/helpers";
import Select from "../../../components/ui/Select";

function toNumber(value) {
  return Number(
    String(value ?? "")
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .replace(/[,،]/g, "")
      .replace(/[^\d.-]/g, "") || 0
  );
}

function formatDate(value, language) {
  return formatCalendarDate(value, language, { time: true });
}

function getEventIcon(event) {
  const type = String(event?.type || event?.source || "").toLowerCase();

  if (type.includes("invoice") || type.includes("factor")) return <FileText size={18} />;
  if (type.includes("payment") || type.includes("receipt") || type.includes("account")) return <CreditCard size={18} />;
  if (type.includes("call") || type.includes("phone")) return <Phone size={18} />;
  if (type.includes("sms") || type.includes("message") || type.includes("whatsapp")) return <MessageCircle size={18} />;
  if (type.includes("mail")) return <Mail size={18} />;
  if (type.includes("task") || type.includes("reminder")) return <BellRing size={18} />;
  if (type.includes("meeting") || type.includes("visit")) return <CalendarClock size={18} />;
  if (type.includes("loyalty") || type.includes("gift")) return <Gift size={18} />;
  if (type.includes("customer")) return <UserRound size={18} />;

  return <MessageCircle size={18} />;
}

function getEventLabel(event, language) {
  const type = String(event?.type || event?.source || "activity").toLowerCase();

  const labelSets = {
    fa: {
      invoice: "فاکتور", payment: "پرداخت", receipt: "دریافت", accounting: "حسابداری",
      opening_balance: "مانده اول دوره",
      call: "تماس", sms: "پیامک", whatsapp: "واتساپ", email: "ایمیل", task: "وظیفه",
      note: "یادداشت", meeting: "جلسه", visit: "ویزیت", loyalty: "باشگاه مشتریان",
      customer: "مشتری", activity: "فعالیت",
    },
    ar: {
      invoice: "فاتورة", payment: "دفعة", receipt: "إيصال", accounting: "محاسبة",
      opening_balance: "الرصيد الافتتاحي",
      call: "مكالمة", sms: "رسالة نصية", whatsapp: "واتساب", email: "بريد إلكتروني", task: "مهمة",
      note: "ملاحظة", meeting: "اجتماع", visit: "زيارة", loyalty: "برنامج الولاء",
      customer: "عميل", activity: "نشاط",
    },
    tr: {
      invoice: "Fatura", payment: "Ödeme", receipt: "Tahsilat", accounting: "Muhasebe",
      opening_balance: "Açılış bakiyesi",
      call: "Arama", sms: "SMS", whatsapp: "WhatsApp", email: "E-posta", task: "Görev",
      note: "Not", meeting: "Toplantı", visit: "Ziyaret", loyalty: "Sadakat programı",
      customer: "Müşteri", activity: "Etkinlik",
    },
    en: {
      invoice: "Invoice", payment: "Payment", receipt: "Receipt", accounting: "Accounting",
      opening_balance: "Opening balance",
      call: "Call", sms: "SMS", whatsapp: "WhatsApp", email: "Email", task: "Task",
      note: "Note", meeting: "Meeting", visit: "Visit", loyalty: "Loyalty",
      customer: "Customer", activity: "Activity",
    },
  };

  const labels = labelSets[language] || labelSets.en;
  const foundKey = Object.keys(labels).find((key) => type.includes(key));
  return labels[foundKey] || event?.type || event?.source || labels.activity;
}

function getEventTone(event) {
  const type = String(event?.type || event?.source || "").toLowerCase();

  if (type.includes("invoice")) return "border-[var(--erp-border)] bg-[var(--erp-glow)] text-[var(--erp-accent)]";
  if (type.includes("payment") || type.includes("receipt")) return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  if (type.includes("task") || type.includes("reminder")) return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  if (type.includes("loyalty") || type.includes("gift")) return "border-yellow-400/20 bg-yellow-400/10 text-yellow-200";
  if (type.includes("call") || type.includes("message") || type.includes("whatsapp")) return "border-blue-400/20 bg-blue-400/10 text-blue-200";

  return "border-slate-400/20 bg-slate-400/10 text-[var(--erp-text)]";
}

// The backend deliberately sends invoice_type/entry_type as raw codes
// (never a hardcoded English title) - these turn them into this UI's
// language, mirroring CustomerFinancial.jsx's invoiceTypeLabel/statusLabel.
function invoiceTypeSuffix(invoiceType, tr) {
  const map = {
    sale: tr("فروش", "بيع", "Satış", "Sale"),
    buy: tr("خرید", "شراء", "Alış", "Buy"),
    proforma: tr("پیش‌فاکتور", "فاتورة أولية", "Proforma", "Proforma"),
    return_sale: tr("مرجوعی فروش", "مرتجع بيع", "Satış iadesi", "Sale return"),
    return_buy: tr("مرجوعی خرید", "مرتجع شراء", "Alış iadesi", "Buy return"),
  };
  return map[invoiceType] || "";
}

function entryTypeLabel(entryType, tr) {
  if (entryType === "debit") return tr("بدهکار", "مدين", "Borç", "Debit");
  if (entryType === "credit") return tr("بستانکار", "دائن", "Alacak", "Credit");
  return "";
}

function normalizeEvents(events) {
  return (Array.isArray(events) ? events : [])
    .filter(Boolean)
    .map((event, index) => ({
      id: event.id || event.event_id || `${event.source || "event"}-${index}-${event.created_at || event.date || ""}`,
      type: event.type || event.source || "activity",
      source: event.source || event.type || "activity",
      title: event.title || event.description || event.text || event.note || "-",
      description: event.description || event.text || event.note || "",
      amount: toNumber(event.amount || event.total_amount || event.debit || event.credit),
      date: event.created_at || event.date || event.updated_at || event.due_date || "",
      raw: event,
    }))
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
}

export default function CustomerTimeline({
  events = [],
  fa = true,
  language,
  money = (v) => String(v ?? 0),
  n = (v) => String(v ?? ""),
  loading = false,
  onRefresh,
  onAddNote,
  onDeleteEvent,
}) {
  const lang = language || (fa ? "fa" : "en");
  const tr = (faText, arText, trText, enText) =>
    lang === "fa" ? faText : lang === "ar" ? arText : lang === "tr" ? trText : enText;

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [quickNote, setQuickNote] = useState("");

  const normalized = useMemo(() => normalizeEvents(events), [events]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return normalized.filter((event) => {
      const matchesQuery =
        !q ||
        String(event.title || "").toLowerCase().includes(q) ||
        String(event.description || "").toLowerCase().includes(q) ||
        String(event.type || "").toLowerCase().includes(q);

      const matchesType =
        typeFilter === "all" ||
        String(event.type || "").toLowerCase().includes(typeFilter) ||
        String(event.source || "").toLowerCase().includes(typeFilter);

      return matchesQuery && matchesType;
    });
  }, [normalized, query, typeFilter]);

  const stats = useMemo(() => {
    return {
      total: normalized.length,
      invoices: normalized.filter((x) => String(x.type).toLowerCase().includes("invoice")).length,
      financial: normalized.filter((x) => ["payment", "receipt", "accounting"].some((k) => String(x.type).toLowerCase().includes(k))).length,
      crm: normalized.filter((x) => !["invoice", "payment", "receipt", "accounting"].some((k) => String(x.type).toLowerCase().includes(k))).length,
    };
  }, [normalized]);

  async function submitQuickNote() {
    if (!quickNote.trim() || !onAddNote) return;

    await onAddNote({
      title: tr("یادداشت سریع", "ملاحظة سريعة", "Hızlı not", "Quick note"),
      text: quickNote.trim(),
      note_type: "note",
      tags: "timeline,quick",
    });

    setQuickNote("");
  }

  return (
    <section className="rounded-[2rem] bg-[var(--erp-panel)] border border-[var(--erp-border)] p-5 text-[var(--erp-text)]">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="text-2xl font-black text-[var(--erp-accent)] flex items-center gap-2">
            <CalendarClock />
            {tr("تایم‌لاین کامل مشتری", "الجدول الزمني الكامل للعميل", "Müşteri zaman çizelgesi", "Customer Timeline")}
          </h2>
          <p className="text-[var(--erp-muted)] text-sm mt-2">
            {tr(
              "همه فاکتورها، پرداخت‌ها، تماس‌ها، یادداشت‌ها، وظایف و فعالیت‌های مشتری در یک مسیر زمانی",
              "جميع الفواتير والمدفوعات والمكالمات والملاحظات والمهام وأنشطة العميل في جدول زمني واحد",
              "Tüm faturalar, ödemeler, aramalar, notlar, görevler ve müşteri etkinlikleri tek bir zaman çizelgesinde",
              "Invoices, payments, calls, notes, tasks and customer activities in one timeline"
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="px-4 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-black flex items-center gap-2 disabled:opacity-60"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          {tr("به‌روزرسانی", "تحديث", "Yenile", "Refresh")}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <TimelineStat title={tr("کل رویدادها", "إجمالي الأحداث", "Toplam olay", "Total")} value={n(stats.total)} />
        <TimelineStat title={tr("فاکتور", "الفواتير", "Faturalar", "Invoices")} value={n(stats.invoices)} />
        <TimelineStat title={tr("مالی", "مالي", "Mali", "Financial")} value={n(stats.financial)} />
        <TimelineStat title="CRM" value={n(stats.crm)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-3 mb-4">
        <div className="relative">
          <Search size={18} className="absolute top-3.5 right-4 text-[var(--erp-muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(lang === "fa" ? toPersianDigits(e.target.value) : e.target.value)}
            placeholder={tr("جستجو در تایم‌لاین...", "بحث في الجدول الزمني...", "Zaman çizelgesinde ara...", "Search timeline...")}
            className="w-full bg-[var(--erp-panel-solid)] text-[var(--erp-text)] rounded-2xl pr-11 pl-4 py-3 outline-none border border-[var(--erp-border)]"
          />
        </div>

        <Select
          value={typeFilter}
          onChange={(value) => setTypeFilter(value)}
          className="w-full"
          options={[
            { value: "all", label: tr("همه رویدادها", "جميع الأحداث", "Tüm olaylar", "All events") },
            { value: "invoice", label: tr("فاکتورها", "الفواتير", "Faturalar", "Invoices") },
            { value: "payment", label: tr("پرداخت / دریافت", "المدفوعات", "Ödemeler", "Payments") },
            { value: "call", label: tr("تماس‌ها", "المكالمات", "Aramalar", "Calls") },
            { value: "task", label: tr("وظایف", "المهام", "Görevler", "Tasks") },
            { value: "note", label: tr("یادداشت‌ها", "الملاحظات", "Notlar", "Notes") },
            { value: "loyalty", label: tr("باشگاه مشتریان", "برنامج الولاء", "Sadakat programı", "Loyalty") },
          ]}
        />
      </div>

      {onAddNote && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_140px] gap-3 mb-5">
          <input
            value={quickNote}
            onChange={(e) => setQuickNote(e.target.value)}
            placeholder={tr("یادداشت سریع برای این مشتری...", "ملاحظة سريعة لهذا العميل...", "Bu müşteri için hızlı not...", "Quick note for this customer...")}
            className="w-full bg-[var(--erp-panel-solid)] text-[var(--erp-text)] rounded-2xl px-4 py-3 outline-none border border-[var(--erp-border)]"
          />
          <button
            type="button"
            onClick={submitQuickNote}
            className="px-4 py-3 rounded-2xl bg-[var(--erp-accent)] text-slate-950 font-black flex items-center justify-center gap-2"
          >
            <Plus size={18} />
            {tr("ثبت", "إضافة", "Ekle", "Add")}
          </button>
        </div>
      )}

      <div className="relative">
        <div className="absolute right-5 top-0 bottom-0 w-px bg-[var(--erp-border)] hidden md:block" />

        <div className="space-y-4 max-h-[650px] overflow-y-auto pr-1">
          {filtered.map((event) => {
            const raw = event.raw || {};
            // Invoice events carry no title from the backend by design (see
            // crm/router.py get_customer_timeline) - built here so it's
            // always in the active UI language, never a hardcoded English
            // "Invoice #.." string.
            const displayTitle =
              event.source === "invoice"
                ? `${tr("فاکتور", "فاتورة", "Fatura", "Invoice")} #${n(raw.invoice_id ?? "")}${
                    invoiceTypeSuffix(raw.invoice_type, tr) ? ` · ${invoiceTypeSuffix(raw.invoice_type, tr)}` : ""
                  }`
                : event.title;
            const entryLabel = entryTypeLabel(raw.entry_type, tr);

            return (
            <div key={event.id} className="relative md:pr-14">
              <div className={`hidden md:flex absolute right-0 top-4 w-10 h-10 rounded-2xl border items-center justify-center ${getEventTone(event)}`}>
                {getEventIcon(event)}
              </div>

              <div className="rounded-3xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-4 hover:border-cyan-400/20 transition">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className={`md:hidden w-10 h-10 rounded-2xl border flex items-center justify-center ${getEventTone(event)}`}>
                      {getEventIcon(event)}
                    </div>

                    <div>
                      <div className="font-black text-[var(--erp-text)]">{displayTitle || "-"}</div>
                      <div className="text-xs text-[var(--erp-muted)] mt-1">{formatDate(event.date, lang)}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-black border ${getEventTone(event)}`}>
                      {getEventLabel(event, lang)}
                    </span>

                    {onDeleteEvent && String(event.source).toLowerCase().includes("note") && (
                      <button
                        type="button"
                        onClick={() => onDeleteEvent(event.raw)}
                        className="w-8 h-8 rounded-xl bg-red-500/10 text-red-200 flex items-center justify-center"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {event.description && event.description !== event.title && (
                  <div className="mt-3 text-[var(--erp-muted)] text-sm leading-7 whitespace-pre-line">
                    {event.description}
                  </div>
                )}

                {event.amount > 0 && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    <div className="inline-flex px-3 py-2 rounded-2xl bg-[var(--erp-glow)] text-[var(--erp-accent)] font-black">
                      {money(event.amount)}
                    </div>
                    {entryLabel && (
                      <span className="text-xs text-[var(--erp-muted)] font-bold">{entryLabel}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="rounded-3xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-8 text-center text-[var(--erp-muted)]">
              {tr("رویدادی برای نمایش وجود ندارد.", "لا توجد أحداث لعرضها.", "Gösterilecek olay yok.", "No events to show.")}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function TimelineStat({ title, value }) {
  return (
    <div className="rounded-2xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-4">
      <div className="text-[var(--erp-muted)] text-xs font-bold">{title}</div>
      <div className="text-2xl font-black text-[var(--erp-accent)] mt-2">{value}</div>
    </div>
  );
}
