import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  UserRound,
  Phone,
  MapPin,
  Mail,
  Wallet,
  FileText,
  CreditCard,
  Printer,
  ArrowRightLeft,
  Clock,
  RefreshCcw,
  MessageCircle,
  BellRing,
  Plus,
  Save,
  Star,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { useLanguage } from "../localization/LanguageContext";
import { getCustomerLedger } from "../services/api";

function toNumber(value) {
  const cleaned = String(value ?? "")
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[,،]/g, "")
    .replace(/[^\d.-]/g, "");
  return Number(cleaned || 0);
}

function balanceLabel(balance, language) {
  if (balance > 0) return language === "fa" ? "بدهکار" : "Debtor";
  if (balance < 0) return language === "fa" ? "بستانکار" : "Creditor";
  return language === "fa" ? "تسویه شده" : "Settled";
}

function sourceLabel(sourceType, language) {
  const fa = {
    opening_balance: "مانده اول دوره",
    invoice: "فاکتور فروش",
    sale: "فاکتور فروش",
    buy: "فاکتور خرید",
    purchase: "فاکتور خرید",
    return_sale: "مرجوعی فروش",
    sale_return: "مرجوعی فروش",
    return_buy: "مرجوعی خرید",
    buy_return: "مرجوعی خرید",
    purchase_return: "مرجوعی خرید",
    receipt: "دریافت از طرف حساب",
    payment: "پرداخت به طرف حساب",
  };

  const en = {
    opening_balance: "Opening balance",
    invoice: "Sales invoice",
    sale: "Sales invoice",
    buy: "Purchase invoice",
    purchase: "Purchase invoice",
    return_sale: "Sales return",
    sale_return: "Sales return",
    return_buy: "Purchase return",
    buy_return: "Purchase return",
    purchase_return: "Purchase return",
    receipt: "Receipt from party",
    payment: "Payment to party",
  };

  return (language === "fa" ? fa : en)[sourceType] || sourceType || "-";
}

function getDebit(row) {
  return toNumber(row.debit);
}

function getCredit(row) {
  return toNumber(row.credit);
}

function getRowBalance(row) {
  if (row.balance !== undefined && row.balance !== null) return toNumber(row.balance);
  if (row.balance_after !== undefined && row.balance_after !== null) return toNumber(row.balance_after);
  return getDebit(row) - getCredit(row);
}

function sortLedgerRows(rows) {
  return [...rows].sort((a, b) => {
    const ad = new Date(a.date || a.created_at || 0).getTime();
    const bd = new Date(b.date || b.created_at || 0).getTime();
    if (ad !== bd) return ad - bd;
    return toNumber(a.id) - toNumber(b.id);
  });
}

export default function CustomerDetails() {
  const { id } = useParams();
  const { language, n, money, dir } = useLanguage();

  const [party, setParty] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("all");
  const [crmNotes, setCrmNotes] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [followupDate, setFollowupDate] = useState("");
  const [crmMessage, setCrmMessage] = useState("");

  const isFa = language === "fa";

  function formatDate(value) {
    if (!value) return "-";
    try {
      return new Intl.DateTimeFormat(isFa ? "fa-IR-u-ca-persian" : "en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(value));
    } catch {
      return String(value);
    }
  }

  async function load() {
    setLoading(true);
    setError("");

    try {
      const data = await getCustomerLedger(id);
      setParty(data.customer || null);
      setLedger(Array.isArray(data.ledger) ? data.ledger : []);
    } catch (err) {
      console.error("Customer ledger error:", err);
      setError(err.message || (isFa ? "خطا در دریافت پرونده طرف‌حساب" : "Error loading party ledger"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`vetrix_crm_${id}`) || "{}");
      setCrmNotes(Array.isArray(saved.notes) ? saved.notes : []);
      setFollowupDate(saved.followupDate || "");
    } catch {
      setCrmNotes([]);
      setFollowupDate("");
    }
  }, [id]);

  function saveCrmState(nextNotes = crmNotes, nextFollowup = followupDate) {
    localStorage.setItem(
      `vetrix_crm_${id}`,
      JSON.stringify({ notes: nextNotes, followupDate: nextFollowup, updated_at: new Date().toISOString() })
    );
  }

  function addCrmNote() {
    if (!newNote.trim()) return;
    const note = {
      id: Date.now(),
      text: newNote.trim(),
      created_at: new Date().toISOString(),
      type: "note",
    };
    const next = [note, ...crmNotes];
    setCrmNotes(next);
    saveCrmState(next, followupDate);
    setNewNote("");
    setCrmMessage(isFa ? "یادداشت CRM ذخیره شد." : "CRM note saved.");
  }

  function saveFollowupDate(value) {
    setFollowupDate(value);
    saveCrmState(crmNotes, value);
    setCrmMessage(isFa ? "تاریخ پیگیری ذخیره شد." : "Follow-up date saved.");
  }

  function whatsappMessage() {
    const balance = finance?.balance || 0;
    if (balance > 0) {
      return isFa
        ? `سلام ${party?.name || ""} عزیز، مانده حساب شما ${money(balance)} است. لطفاً جهت تسویه یا هماهنگی با ما در ارتباط باشید.`
        : `Hello ${party?.name || ""}, your outstanding balance is ${money(balance)}. Please contact us for settlement.`;
    }
    return isFa
      ? `سلام ${party?.name || ""} عزیز، ممنون از همکاری شما. جهت سفارش یا پیگیری بعدی در خدمت شما هستیم.`
      : `Hello ${party?.name || ""}, thank you for your cooperation. We are ready for your next order or follow-up.`;
  }

  function openWhatsApp() {
    const phone = String(party?.mobile || party?.phone || "").replace(/[^0-9]/g, "");
    if (!phone) {
      alert(isFa ? "شماره موبایل/تلفن ثبت نشده است." : "No phone/mobile number is saved.");
      return;
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(whatsappMessage())}`, "_blank");
  }

  const normalizedLedger = useMemo(() => {
    let running = 0;

    return sortLedgerRows(ledger).map((row) => {
      const debit = getDebit(row);
      const credit = getCredit(row);
      running += debit - credit;

      return {
        ...row,
        debit,
        credit,
        computedBalance: running,
        shownBalance: row.balance !== undefined && row.balance !== null ? toNumber(row.balance) : running,
      };
    });
  }, [ledger]);

  const finance = useMemo(() => {
    const totalDebit = normalizedLedger.reduce((s, x) => s + toNumber(x.debit), 0);
    const totalCredit = normalizedLedger.reduce((s, x) => s + toNumber(x.credit), 0);
    const computedBalance = totalDebit - totalCredit;

    const backendBalance = party?.balance !== undefined && party?.balance !== null ? toNumber(party.balance) : computedBalance;
    const balance = Number.isFinite(computedBalance) ? computedBalance : backendBalance;

    const debtor = balance > 0 ? balance : 0;
    const creditor = balance < 0 ? Math.abs(balance) : 0;

    const opening = normalizedLedger
      .filter((x) => x.source_type === "opening_balance")
      .reduce((s, x) => s + toNumber(x.debit) - toNumber(x.credit), 0);

    const received = normalizedLedger
      .filter((x) => x.source_type === "receipt")
      .reduce((s, x) => s + toNumber(x.credit), 0);

    const paid = normalizedLedger
      .filter((x) => x.source_type === "payment")
      .reduce((s, x) => s + toNumber(x.debit), 0);

    const lastActivity = normalizedLedger.length ? normalizedLedger[normalizedLedger.length - 1] : null;

    return {
      balance,
      debtor,
      creditor,
      opening,
      totalDebit,
      totalCredit,
      received,
      paid,
      lastActivity,
    };
  }, [normalizedLedger, party]);

  const visibleRows = viewMode === "bank"
    ? normalizedLedger.filter((r) => r.source_type === "receipt" || r.source_type === "payment")
    : normalizedLedger;

  const bankRows = useMemo(() => {
    let cashBalance = 0;

    return normalizedLedger
      .filter((row) => row.source_type === "receipt" || row.source_type === "payment")
      .map((row) => {
        const inflow = row.source_type === "receipt" ? toNumber(row.credit || row.amount) : 0;
        const outflow = row.source_type === "payment" ? toNumber(row.debit || row.amount) : 0;
        cashBalance += inflow - outflow;
        return { ...row, inflow, outflow, cashBalance };
      });
  }, [normalizedLedger]);

  const customerIntelligence = useMemo(() => {
    let score = 50;
    if (party?.phone || party?.mobile) score += 8;
    if (party?.email) score += 5;
    if (party?.address || party?.city) score += 5;
    if (normalizedLedger.length >= 3) score += 10;
    if (finance.balance > 0) score -= 10;
    if (finance.balance > 0 && toNumber(party?.credit_limit) > 0 && finance.balance > toNumber(party.credit_limit)) score -= 15;
    if (finance.balance <= 0 && normalizedLedger.length > 0) score += 10;
    score = Math.max(0, Math.min(100, Math.round(score)));

    const level = score >= 80 ? "vip" : score >= 60 ? "active" : finance.balance > 0 ? "followup" : "normal";
    const suggestion =
      finance.balance > 0
        ? (isFa ? "پیگیری مطالبات و ثبت نتیجه تماس پیشنهاد می‌شود." : "Follow up receivables and log the call result.")
        : normalizedLedger.length === 0
        ? (isFa ? "برای این مشتری هنوز گردش مالی ثبت نشده است؛ اولین تعامل را ثبت کن." : "No financial activity yet; register the first interaction.")
        : (isFa ? "ارتباط با مشتری حفظ شود و پیشنهاد خرید مجدد ارسال گردد." : "Maintain relationship and send a reorder proposal.");

    return { score, level, suggestion };
  }, [party, normalizedLedger, finance, isFa]);

  const crmTimeline = useMemo(() => {
    const ledgerEvents = normalizedLedger.slice(-8).map((row) => ({
      id: `ledger-${row.id || row.source_id || Math.random()}`,
      date: row.date || row.created_at,
      title: row.description || sourceLabel(row.source_type, language),
      amount: toNumber(row.debit) || toNumber(row.credit),
      type: "financial",
    }));

    const noteEvents = crmNotes.slice(0, 8).map((note) => ({
      id: `note-${note.id}`,
      date: note.created_at,
      title: note.text,
      amount: 0,
      type: "crm",
    }));

    return [...ledgerEvents, ...noteEvents]
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
      .slice(0, 10);
  }, [normalizedLedger, crmNotes, language]);

  function printPage() {
    window.print();
  }

  if (loading && !party) {
    return (
      <div dir={dir} className="text-cyan-300 p-8">
        {isFa ? "در حال بارگذاری..." : "Loading..."}
      </div>
    );
  }

  if (error) {
    return (
      <div dir={dir} className="p-8">
        <div className="bg-rose-500/15 border border-rose-400/30 rounded-2xl p-5 text-rose-100">
          {error}
        </div>
        <Link
          to="/customers"
          className="inline-flex mt-4 px-4 py-3 rounded-xl bg-cyan-400 text-slate-950 font-black"
        >
          {isFa ? "بازگشت" : "Back"}
        </Link>
      </div>
    );
  }

  if (!party) return null;

  return (
    <div dir={dir} className="space-y-6" style={{ direction: dir }}>
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div className="flex gap-2 flex-wrap">
          <Link
            to="/customers"
            className="px-4 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-black flex items-center gap-2"
          >
            <ArrowLeft size={18} />
            {isFa ? "بازگشت" : "Back"}
          </Link>

          <button
            onClick={printPage}
            className="px-4 py-3 rounded-2xl bg-slate-800 text-cyan-200 font-black flex items-center gap-2"
          >
            <Printer size={18} />
            {isFa ? "چاپ پرونده" : "Print"}
          </button>

          <button
            onClick={openWhatsApp}
            className="px-4 py-3 rounded-2xl bg-emerald-500/20 text-emerald-200 font-black flex items-center gap-2 border border-emerald-400/20"
          >
            <MessageCircle size={18} />
            {isFa ? "واتساپ" : "WhatsApp"}
          </button>

          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-3 rounded-2xl bg-slate-800 text-cyan-200 font-black flex items-center gap-2 disabled:opacity-60"
          >
            <RefreshCcw size={18} />
            {isFa ? "به‌روزرسانی" : "Refresh"}
          </button>
        </div>

        <div className="text-right">
          <h1 className="text-4xl font-black text-cyan-400">
            {isFa ? "پرونده ۳۶۰ درجه طرف‌حساب" : "Customer 360 Profile"}
          </h1>
          <p className="text-slate-400 mt-2">
            {isFa ? `پرونده کامل مالی، CRM، پیگیری و ارتباطات طرف‌حساب #${n(party.id)}` : `Complete finance and CRM profile #${party.id}`}
          </p>
        </div>
      </div>

      <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-3xl font-black text-white">{party.name}</h2>
            <div className="text-cyan-300 font-bold mt-1">{party.customer_type || "customer"}</div>
          </div>
          <div className="w-16 h-16 rounded-3xl bg-cyan-400/10 text-cyan-300 flex items-center justify-center">
            <UserRound size={34} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Info icon={<Phone size={17} />} label={isFa ? "شماره تماس" : "Phone"} value={party.phone || "-"} />
          <Info icon={<Mail size={17} />} label={isFa ? "ایمیل" : "Email"} value={party.email || "-"} />
          <Info icon={<MapPin size={17} />} label={isFa ? "شهر" : "City"} value={party.city || "-"} />
          <Info icon={<MapPin size={17} />} label={isFa ? "آدرس" : "Address"} value={party.address || "-"} />
          <Info icon={<CreditCard size={17} />} label={isFa ? "کد ملی/شناسه" : "National ID"} value={party.national_id || "-"} />
          <Info icon={<CreditCard size={17} />} label={isFa ? "کد اقتصادی" : "Economic Code"} value={party.economic_code || "-"} />
          <Info icon={<UserRound size={17} />} label={isFa ? "شخص رابط" : "Contact"} value={party.contact_person || "-"} />
          <Info icon={<Wallet size={17} />} label={isFa ? "سقف اعتبار" : "Credit Limit"} value={money(toNumber(party.credit_limit))} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <Kpi
          title={isFa ? "مانده حساب" : "Balance"}
          value={money(Math.abs(finance.balance))}
          hint={isFa ? `${party.name} ${balanceLabel(finance.balance, language)} است` : balanceLabel(finance.balance, language)}
          color={finance.balance > 0 ? "#fca5a5" : finance.balance < 0 ? "#86efac" : "#22d3ee"}
          icon={<Wallet size={20} />}
        />
        <Kpi title={isFa ? "بدهکار" : "Debtor"} value={money(finance.debtor)} color="#fca5a5" icon={<Wallet size={20} />} />
        <Kpi title={isFa ? "بستانکار" : "Creditor"} value={money(finance.creditor)} color="#86efac" icon={<Wallet size={20} />} />
        <Kpi title={isFa ? "مانده اول دوره" : "Opening"} value={money(Math.abs(finance.opening))} hint={balanceLabel(finance.opening, language)} color="#22d3ee" icon={<Wallet size={20} />} />
        <Kpi title={isFa ? "آخرین فعالیت" : "Last activity"} value={finance.lastActivity ? formatDate(finance.lastActivity.date || finance.lastActivity.created_at) : "-"} icon={<Clock size={20} />} />
        <Kpi title={isFa ? "تعداد تراکنش" : "Transactions"} value={n(normalizedLedger.length)} icon={<ArrowRightLeft size={20} />} />
        <Kpi title={isFa ? "جمع بدهکار" : "Total debit"} value={money(finance.totalDebit)} icon={<ArrowRightLeft size={20} />} />
        <Kpi title={isFa ? "جمع بستانکار" : "Total credit"} value={money(finance.totalCredit)} icon={<ArrowRightLeft size={20} />} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-5">
        <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
            <h2 className="text-2xl font-black text-cyan-400 flex items-center gap-2">
              <Sparkles size={24} />
              {isFa ? "هوش ارتباط با مشتری" : "Customer Intelligence"}
            </h2>
            <span className={`px-4 py-2 rounded-2xl font-black ${customerIntelligence.score >= 80 ? "bg-yellow-400/10 text-yellow-300" : customerIntelligence.score >= 60 ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>
              <Star size={16} className="inline mx-1" /> {n(customerIntelligence.score)}/100
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <Info icon={<BellRing size={17} />} label={isFa ? "پیگیری بعدی" : "Next follow-up"} value={followupDate || (isFa ? "ثبت نشده" : "Not set")} />
            <Info icon={<CheckCircle2 size={17} />} label={isFa ? "وضعیت CRM" : "CRM Status"} value={customerIntelligence.level} />
            <Info icon={<MessageCircle size={17} />} label={isFa ? "یادداشت‌ها" : "Notes"} value={n(crmNotes.length)} />
          </div>

          <div className="rounded-2xl bg-cyan-500/10 border border-cyan-400/20 p-4 text-cyan-100 font-bold mb-5">
            {customerIntelligence.suggestion}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3 mb-4">
            <input
              value={followupDate}
              onChange={(e) => saveFollowupDate(e.target.value)}
              type="text"
              className="bg-slate-800 text-white rounded-2xl p-4 outline-none border border-cyan-500/10"
              placeholder={isFa ? "مثال: ۱۴۰۵/۰۴/۲۵" : "Example: 2026/07/16"}
            />
            <button
              onClick={openWhatsApp}
              className="bg-emerald-500/20 text-emerald-200 border border-emerald-400/20 rounded-2xl font-black flex items-center justify-center gap-2"
            >
              <MessageCircle size={18} />
              {isFa ? "پیام آماده واتساپ" : "WhatsApp message"}
            </button>
          </div>

          {crmMessage && (
            <div className="rounded-2xl p-3 bg-emerald-500/10 border border-emerald-400/20 text-emerald-200 text-sm mb-4">
              {crmMessage}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-3">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={3}
              className="bg-slate-800 text-white rounded-2xl p-4 outline-none border border-cyan-500/10"
              placeholder={isFa ? "یادداشت تماس، مذاکره، قول پرداخت یا درخواست مشتری..." : "Call note, negotiation, payment promise or customer request..."}
            />
            <button
              onClick={addCrmNote}
              className="bg-cyan-400 text-slate-950 rounded-2xl font-black flex items-center justify-center gap-2"
            >
              <Plus size={18} />
              {isFa ? "ثبت" : "Add"}
            </button>
          </div>
        </div>

        <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5">
          <h2 className="text-2xl font-black text-cyan-400 flex items-center gap-2 mb-5">
            <Clock size={24} />
            {isFa ? "تایم‌لاین مشتری" : "Customer timeline"}
          </h2>
          <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
            {crmTimeline.map((event) => (
              <div key={event.id} className="rounded-2xl bg-slate-800/70 border border-white/5 p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="text-white font-black text-sm">{event.title}</div>
                  <span className={`text-xs px-2 py-1 rounded-full ${event.type === "crm" ? "bg-cyan-400/10 text-cyan-300" : "bg-emerald-400/10 text-emerald-300"}`}>
                    {event.type === "crm" ? (isFa ? "CRM" : "CRM") : (isFa ? "مالی" : "Finance")}
                  </span>
                </div>
                <div className="text-xs text-slate-400 flex items-center justify-between gap-2">
                  <span>{formatDate(event.date)}</span>
                  {event.amount ? <b className="text-cyan-300">{money(event.amount)}</b> : null}
                </div>
              </div>
            ))}

            {crmTimeline.length === 0 && (
              <div className="text-slate-400">{isFa ? "هنوز رویدادی ثبت نشده است." : "No timeline events yet."}</div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5">
        <div className="flex flex-wrap justify-between gap-3 mb-5">
          <h2 className="text-2xl font-black text-cyan-400 flex items-center gap-2">
            <FileText size={24} />
            {isFa ? "صورت‌حساب" : "Ledger"}
          </h2>

          <div className="flex gap-2">
            <button
              onClick={() => setViewMode("all")}
              className={`px-4 py-2 rounded-xl font-black ${
                viewMode === "all" ? "bg-cyan-400 text-slate-950" : "bg-slate-800 text-white"
              }`}
            >
              {isFa ? "دفتر کل" : "All"}
            </button>

            <button
              onClick={() => setViewMode("bank")}
              className={`px-4 py-2 rounded-xl font-black ${
                viewMode === "bank" ? "bg-cyan-400 text-slate-950" : "bg-slate-800 text-white"
              }`}
            >
              {isFa ? "ریزگردش بانکی" : "Bank"}
            </button>
          </div>
        </div>

        {viewMode === "all" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-cyan-300 border-b border-cyan-500/20">
                  <th className="p-3 text-right">{isFa ? "تاریخ" : "Date"}</th>
                  <th className="p-3 text-right">{isFa ? "شرح" : "Description"}</th>
                  <th className="p-3 text-right">{isFa ? "بدهکار" : "Debit"}</th>
                  <th className="p-3 text-right">{isFa ? "بستانکار" : "Credit"}</th>
                  <th className="p-3 text-right">{isFa ? "مانده حساب" : "Account balance"}</th>
                  <th className="p-3 text-right">{isFa ? "وضعیت" : "Status"}</th>
                </tr>
              </thead>

              <tbody>
                {visibleRows.map((row, index) => {
                  const bal = toNumber(row.computedBalance ?? getRowBalance(row));

                  return (
                    <tr key={`${row.id}-${index}`} className="border-b border-slate-800 hover:bg-cyan-500/5">
                      <td className="p-3 text-slate-200">{formatDate(row.date || row.created_at)}</td>
                      <td className="p-3">
                        <div className="font-black text-white">
                          {row.description || sourceLabel(row.source_type, language)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {sourceLabel(row.source_type, language)} {row.source_id ? `#${n(row.source_id)}` : ""}
                        </div>
                      </td>
                      <td className="p-3 text-rose-300 font-black">
                        {toNumber(row.debit) ? money(row.debit) : "-"}
                      </td>
                      <td className="p-3 text-emerald-300 font-black">
                        {toNumber(row.credit) ? money(row.credit) : "-"}
                      </td>
                      <td className="p-3 text-cyan-300 font-black">{money(Math.abs(bal))}</td>
                      <td className="p-3 text-white font-black">{balanceLabel(bal, language)}</td>
                    </tr>
                  );
                })}

                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-slate-400">
                      {isFa ? "هنوز گردش حسابی ثبت نشده است" : "No ledger rows"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-cyan-300 border-b border-cyan-500/20">
                  <th className="p-3 text-right">{isFa ? "تاریخ" : "Date"}</th>
                  <th className="p-3 text-right">{isFa ? "شرح عملیات بانکی" : "Bank transaction"}</th>
                  <th className="p-3 text-right">{isFa ? "ورود وجه" : "Inflow"}</th>
                  <th className="p-3 text-right">{isFa ? "خروج وجه" : "Outflow"}</th>
                  <th className="p-3 text-right">{isFa ? "مانده نقد/بانک" : "Cash/Bank balance"}</th>
                  <th className="p-3 text-right">{isFa ? "نوع" : "Type"}</th>
                </tr>
              </thead>

              <tbody>
                {bankRows.map((row, index) => (
                  <tr key={`${row.id}-${index}`} className="border-b border-slate-800 hover:bg-cyan-500/5">
                    <td className="p-3 text-slate-200">{formatDate(row.date || row.created_at)}</td>
                    <td className="p-3">
                      <div className="font-black text-white">
                        {row.description || sourceLabel(row.source_type, language)}
                      </div>
                      <div className="text-xs text-slate-500">{row.source_id ? `#${n(row.source_id)}` : ""}</div>
                    </td>
                    <td className="p-3 text-emerald-300 font-black">{row.inflow ? money(row.inflow) : "-"}</td>
                    <td className="p-3 text-rose-300 font-black">{row.outflow ? money(row.outflow) : "-"}</td>
                    <td className="p-3 text-cyan-300 font-black">{money(Math.abs(row.cashBalance))}</td>
                    <td className="p-3 text-white font-black">{sourceLabel(row.source_type, language)}</td>
                  </tr>
                ))}

                {bankRows.length === 0 && (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-slate-400">
                      {isFa ? "هنوز دریافت یا پرداخت بانکی ثبت نشده است" : "No bank transaction has been registered yet"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ icon, label, value }) {
  return (
    <div className="bg-slate-800/80 border border-white/5 rounded-2xl p-4">
      <div className="text-slate-400 text-xs flex items-center gap-2 mb-2">
        {icon}
        {label}
      </div>
      <div className="text-white font-black">{value}</div>
    </div>
  );
}

function Kpi({ title, value, hint, color = "#22d3ee", icon }) {
  return (
    <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-slate-300 font-bold mb-3">{title}</div>
          <div className="text-3xl font-black" style={{ color }}>
            {value}
          </div>
          {hint && (
            <div className="text-xs mt-2" style={{ color }}>
              {hint}
            </div>
          )}
        </div>
        <div className="text-cyan-300 bg-cyan-400/10 w-10 h-10 rounded-2xl flex items-center justify-center">
          {icon}
        </div>
      </div>
    </div>
  );
}
