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

function toNumber(value) {
  return Number(
    String(value ?? "")
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .replace(/[,،]/g, "")
      .replace(/[^\d.-]/g, "") || 0
  );
}

function formatDate(value, fa) {
  if (!value) return "-";

  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return String(value);
  }
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

function getEventLabel(event, fa) {
  const type = String(event?.type || event?.source || "activity").toLowerCase();

  const labelsFa = {
    invoice: "فاکتور",
    payment: "پرداخت",
    receipt: "دریافت",
    accounting: "حسابداری",
    call: "تماس",
    sms: "پیامک",
    whatsapp: "واتساپ",
    email: "ایمیل",
    task: "وظیفه",
    note: "یادداشت",
    meeting: "جلسه",
    visit: "ویزیت",
    loyalty: "باشگاه مشتریان",
    customer: "مشتری",
    activity: "فعالیت",
  };

  const labelsEn = {
    invoice: "Invoice",
    payment: "Payment",
    receipt: "Receipt",
    accounting: "Accounting",
    call: "Call",
    sms: "SMS",
    whatsapp: "WhatsApp",
    email: "Email",
    task: "Task",
    note: "Note",
    meeting: "Meeting",
    visit: "Visit",
    loyalty: "Loyalty",
    customer: "Customer",
    activity: "Activity",
  };

  const labels = fa ? labelsFa : labelsEn;
  const foundKey = Object.keys(labels).find((key) => type.includes(key));
  return labels[foundKey] || event?.type || event?.source || labels.activity;
}

function getEventTone(event) {
  const type = String(event?.type || event?.source || "").toLowerCase();

  if (type.includes("invoice")) return "border-cyan-400/20 bg-cyan-400/10 text-cyan-200";
  if (type.includes("payment") || type.includes("receipt")) return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  if (type.includes("task") || type.includes("reminder")) return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  if (type.includes("loyalty") || type.includes("gift")) return "border-yellow-400/20 bg-yellow-400/10 text-yellow-200";
  if (type.includes("call") || type.includes("message") || type.includes("whatsapp")) return "border-blue-400/20 bg-blue-400/10 text-blue-200";

  return "border-slate-400/20 bg-slate-400/10 text-slate-200";
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
  money = (v) => String(v ?? 0),
  n = (v) => String(v ?? ""),
  loading = false,
  onRefresh,
  onAddNote,
  onDeleteEvent,
}) {
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
      title: fa ? "یادداشت سریع" : "Quick note",
      text: quickNote.trim(),
      note_type: "note",
      tags: "timeline,quick",
    });

    setQuickNote("");
  }

  return (
    <section className="rounded-[2rem] bg-slate-900/70 border border-cyan-400/20 p-5 text-white">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="text-2xl font-black text-cyan-300 flex items-center gap-2">
            <CalendarClock />
            {fa ? "تایم‌لاین کامل مشتری" : "Customer Timeline"}
          </h2>
          <p className="text-slate-400 text-sm mt-2">
            {fa
              ? "همه فاکتورها، پرداخت‌ها، تماس‌ها، یادداشت‌ها، وظایف و فعالیت‌های مشتری در یک مسیر زمانی"
              : "Invoices, payments, calls, notes, tasks and customer activities in one timeline"}
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="px-4 py-3 rounded-2xl bg-slate-800 text-cyan-200 font-black flex items-center gap-2 disabled:opacity-60"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          {fa ? "به‌روزرسانی" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <TimelineStat title={fa ? "کل رویدادها" : "Total"} value={n(stats.total)} />
        <TimelineStat title={fa ? "فاکتور" : "Invoices"} value={n(stats.invoices)} />
        <TimelineStat title={fa ? "مالی" : "Financial"} value={n(stats.financial)} />
        <TimelineStat title={fa ? "CRM" : "CRM"} value={n(stats.crm)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-3 mb-4">
        <div className="relative">
          <Search size={18} className="absolute top-3.5 right-4 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={fa ? "جستجو در تایم‌لاین..." : "Search timeline..."}
            className="w-full bg-slate-800 text-white rounded-2xl pr-11 pl-4 py-3 outline-none border border-cyan-400/10"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="w-full bg-slate-800 text-white rounded-2xl px-4 py-3 outline-none border border-cyan-400/10"
        >
          <option value="all">{fa ? "همه رویدادها" : "All events"}</option>
          <option value="invoice">{fa ? "فاکتورها" : "Invoices"}</option>
          <option value="payment">{fa ? "پرداخت / دریافت" : "Payments"}</option>
          <option value="call">{fa ? "تماس‌ها" : "Calls"}</option>
          <option value="task">{fa ? "وظایف" : "Tasks"}</option>
          <option value="note">{fa ? "یادداشت‌ها" : "Notes"}</option>
          <option value="loyalty">{fa ? "باشگاه مشتریان" : "Loyalty"}</option>
        </select>
      </div>

      {onAddNote && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_140px] gap-3 mb-5">
          <input
            value={quickNote}
            onChange={(e) => setQuickNote(e.target.value)}
            placeholder={fa ? "یادداشت سریع برای این مشتری..." : "Quick note for this customer..."}
            className="w-full bg-slate-800 text-white rounded-2xl px-4 py-3 outline-none border border-cyan-400/10"
          />
          <button
            type="button"
            onClick={submitQuickNote}
            className="px-4 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-black flex items-center justify-center gap-2"
          >
            <Plus size={18} />
            {fa ? "ثبت" : "Add"}
          </button>
        </div>
      )}

      <div className="relative">
        <div className="absolute right-5 top-0 bottom-0 w-px bg-cyan-400/20 hidden md:block" />

        <div className="space-y-4 max-h-[650px] overflow-y-auto pr-1">
          {filtered.map((event) => (
            <div key={event.id} className="relative md:pr-14">
              <div className={`hidden md:flex absolute right-0 top-4 w-10 h-10 rounded-2xl border items-center justify-center ${getEventTone(event)}`}>
                {getEventIcon(event)}
              </div>

              <div className="rounded-3xl bg-slate-800/70 border border-white/5 p-4 hover:border-cyan-400/20 transition">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className={`md:hidden w-10 h-10 rounded-2xl border flex items-center justify-center ${getEventTone(event)}`}>
                      {getEventIcon(event)}
                    </div>

                    <div>
                      <div className="font-black text-white">{event.title || "-"}</div>
                      <div className="text-xs text-slate-500 mt-1">{formatDate(event.date, fa)}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-black border ${getEventTone(event)}`}>
                      {getEventLabel(event, fa)}
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
                  <div className="mt-3 text-slate-300 text-sm leading-7 whitespace-pre-line">
                    {event.description}
                  </div>
                )}

                {event.amount > 0 && (
                  <div className="mt-3 inline-flex px-3 py-2 rounded-2xl bg-cyan-400/10 text-cyan-200 font-black">
                    {money(event.amount)}
                  </div>
                )}
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="rounded-3xl bg-slate-800/60 border border-white/5 p-8 text-center text-slate-400">
              {fa ? "رویدادی برای نمایش وجود ندارد." : "No events to show."}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function TimelineStat({ title, value }) {
  return (
    <div className="rounded-2xl bg-slate-800/70 border border-white/5 p-4">
      <div className="text-slate-400 text-xs font-bold">{title}</div>
      <div className="text-2xl font-black text-cyan-300 mt-2">{value}</div>
    </div>
  );
}
