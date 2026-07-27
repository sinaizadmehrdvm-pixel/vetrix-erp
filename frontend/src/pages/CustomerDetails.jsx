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
  Star,
  Sparkles,
  CheckCircle2,
  Link2,
  ShieldOff,
} from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits } from "../localization/helpers";
import JalaliDateField from "../components/forms/JalaliDateField";
import {
  createCustomerPortalLink,
  createSupplierPortalLink,
  getCustomerLedger,
  getCustomerPortalStatus,
  getSupplierPortalStatus,
  revokeCustomerPortalAccess,
  revokeSupplierPortalAccess,
} from "../services/api";

function toNumber(value) {
  const cleaned = String(value ?? "")
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[,،]/g, "")
    .replace(/[^\d.-]/g, "");
  return Number(cleaned || 0);
}

function balanceLabel(balance, language) {
  if (balance > 0) {
    return language === "fa" ? "بدهکار" : language === "ar" ? "مدين" : language === "tr" ? "Borçlu" : "Debtor";
  }
  if (balance < 0) {
    return language === "fa" ? "بستانکار" : language === "ar" ? "دائن" : language === "tr" ? "Alacaklı" : "Creditor";
  }
  return language === "fa" ? "تسویه شده" : language === "ar" ? "مسوّى" : language === "tr" ? "Kapatıldı" : "Settled";
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

  const ar = {
    opening_balance: "الرصيد الافتتاحي",
    invoice: "فاتورة بيع",
    sale: "فاتورة بيع",
    buy: "فاتورة شراء",
    purchase: "فاتورة شراء",
    return_sale: "مرتجع بيع",
    sale_return: "مرتجع بيع",
    return_buy: "مرتجع شراء",
    buy_return: "مرتجع شراء",
    purchase_return: "مرتجع شراء",
    receipt: "قبض من الطرف",
    payment: "دفعة إلى الطرف",
  };

  const tr = {
    opening_balance: "Açılış bakiyesi",
    invoice: "Satış faturası",
    sale: "Satış faturası",
    buy: "Alış faturası",
    purchase: "Alış faturası",
    return_sale: "Satış iadesi",
    sale_return: "Satış iadesi",
    return_buy: "Alış iadesi",
    buy_return: "Alış iadesi",
    purchase_return: "Alış iadesi",
    receipt: "Cariden tahsilat",
    payment: "Cariye ödeme",
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

  const table = language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? tr : en;
  return table[sourceType] || sourceType || "-";
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
  const { language, n, money, date, dir } = useLanguage();

  const [party, setParty] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("all");
  const [crmNotes, setCrmNotes] = useState([]);
  const [newNote, setNewNote] = useState("");
  const [followupDate, setFollowupDate] = useState("");
  const [crmMessage, setCrmMessage] = useState("");
  const [portalEnabled, setPortalEnabled] = useState(false);
  const [portalLink, setPortalLink] = useState("");
  const [portalBusy, setPortalBusy] = useState(false);
  const [supplierPortalEnabled, setSupplierPortalEnabled] = useState(false);
  const [supplierPortalLink, setSupplierPortalLink] = useState("");
  const [supplierPortalBusy, setSupplierPortalBusy] = useState(false);

  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  function formatDate(value) {
    return value ? date(value, { month: "long" }) : "-";
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
      setError(err.message || tr("خطا در دریافت پرونده طرف‌حساب", "خطأ في جلب ملف حساب العميل", "Cari dosyası alınırken hata oluştu", "Error loading party ledger"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    let active = true;
    getCustomerPortalStatus(id)
      .then((data) => { if (active) setPortalEnabled(Boolean(data?.enabled)); })
      .catch(() => {});
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    let active = true;
    getSupplierPortalStatus(id)
      .then((data) => { if (active) setSupplierPortalEnabled(Boolean(data?.enabled)); })
      .catch(() => {});
    return () => { active = false; };
  }, [id]);

  async function generatePortalLink() {
    setPortalBusy(true);
    try {
      const data = await createCustomerPortalLink(id);
      setPortalLink(`${window.location.origin}/portal/${data.token}`);
      setPortalEnabled(true);
      toast.success(tr("لینک پورتال ساخته شد.", "تم إنشاء رابط البوابة.", "Portal bağlantısı oluşturuldu.", "Portal link created."));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPortalBusy(false);
    }
  }

  async function revokePortalLink() {
    setPortalBusy(true);
    try {
      await revokeCustomerPortalAccess(id);
      setPortalEnabled(false);
      setPortalLink("");
      toast.success(tr("دسترسی پورتال لغو شد.", "تم إلغاء الوصول إلى البوابة.", "Portal erişimi iptal edildi.", "Portal access revoked."));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPortalBusy(false);
    }
  }

  async function copyPortalLink() {
    try {
      await navigator.clipboard.writeText(portalLink);
      toast.success(tr("لینک کپی شد.", "تم نسخ الرابط.", "Bağlantı kopyalandı.", "Link copied."));
    } catch {
      toast.error(tr("کپی خودکار ممکن نشد.", "تعذّر النسخ التلقائي.", "Otomatik kopyalama başarısız oldu.", "Couldn't copy automatically."));
    }
  }

  async function generateSupplierPortalLink() {
    setSupplierPortalBusy(true);
    try {
      const data = await createSupplierPortalLink(id);
      setSupplierPortalLink(`${window.location.origin}/supplier-portal/${data.token}`);
      setSupplierPortalEnabled(true);
      toast.success(tr("لینک پورتال تأمین‌کننده ساخته شد.", "تم إنشاء رابط بوابة المورد.", "Tedarikçi portal bağlantısı oluşturuldu.", "Supplier portal link created."));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSupplierPortalBusy(false);
    }
  }

  async function revokeSupplierPortalLink() {
    setSupplierPortalBusy(true);
    try {
      await revokeSupplierPortalAccess(id);
      setSupplierPortalEnabled(false);
      setSupplierPortalLink("");
      toast.success(tr("دسترسی پورتال تأمین‌کننده لغو شد.", "تم إلغاء الوصول إلى بوابة المورد.", "Tedarikçi portal erişimi iptal edildi.", "Supplier portal access revoked."));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSupplierPortalBusy(false);
    }
  }

  async function copySupplierPortalLink() {
    try {
      await navigator.clipboard.writeText(supplierPortalLink);
      toast.success(tr("لینک کپی شد.", "تم نسخ الرابط.", "Bağlantı kopyalandı.", "Link copied."));
    } catch {
      toast.error(tr("کپی خودکار ممکن نشد.", "تعذّر النسخ التلقائي.", "Otomatik kopyalama başarısız oldu.", "Couldn't copy automatically."));
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(`vetrix_crm_${id}`) || "{}");
        setCrmNotes(Array.isArray(saved.notes) ? saved.notes : []);
        setFollowupDate(saved.followupDate || "");
      } catch {
        setCrmNotes([]);
        setFollowupDate("");
      }
    }, 0);
    return () => clearTimeout(timer);
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
    setCrmMessage(tr("یادداشت CRM ذخیره شد.", "تم حفظ ملاحظة CRM.", "CRM notu kaydedildi.", "CRM note saved."));
  }

  function saveFollowupDate(value) {
    setFollowupDate(value);
    saveCrmState(crmNotes, value);
    setCrmMessage(tr("تاریخ پیگیری ذخیره شد.", "تم حفظ تاريخ المتابعة.", "Takip tarihi kaydedildi.", "Follow-up date saved."));
  }

  function whatsappMessage() {
    const balance = finance?.balance || 0;
    if (balance > 0) {
      return tr(
        `سلام ${party?.name || ""} عزیز، مانده حساب شما ${money(balance)} است. لطفاً جهت تسویه یا هماهنگی با ما در ارتباط باشید.`,
        `مرحباً ${party?.name || ""} الكريم، رصيد حسابك ${money(balance)}. يرجى التواصل معنا للتسوية أو التنسيق.`,
        `Sayın ${party?.name || ""}, hesap bakiyeniz ${money(balance)}. Lütfen mutabakat veya bilgi için bizimle iletişime geçin.`,
        `Hello ${party?.name || ""}, your outstanding balance is ${money(balance)}. Please contact us for settlement.`
      );
    }
    return tr(
      `سلام ${party?.name || ""} عزیز، ممنون از همکاری شما. جهت سفارش یا پیگیری بعدی در خدمت شما هستیم.`,
      `مرحباً ${party?.name || ""} الكريم، نشكر لكم تعاونكم. نحن في خدمتكم لأي طلب أو متابعة لاحقة.`,
      `Sayın ${party?.name || ""}, iş birliğiniz için teşekkür ederiz. Yeni bir sipariş veya sonraki takip için hizmetinizdeyiz.`,
      `Hello ${party?.name || ""}, thank you for your cooperation. We are ready for your next order or follow-up.`
    );
  }

  function openWhatsApp() {
    const phone = String(party?.mobile || party?.phone || "").replace(/[^0-9]/g, "");
    if (!phone) {
      alert(tr("شماره موبایل/تلفن ثبت نشده است.", "لم يتم تسجيل رقم الهاتف/الجوال.", "Telefon/cep telefonu numarası kayıtlı değil.", "No phone/mobile number is saved."));
      return;
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(whatsappMessage())}`, "_blank");
  }

  const normalizedLedger = useMemo(() => {
    return sortLedgerRows(ledger).reduce((rows, row) => {
      const previousBalance = rows.at(-1)?.computedBalance || 0;
      const debit = getDebit(row);
      const credit = getCredit(row);
      const computedBalance = previousBalance + debit - credit;
      rows.push({
        ...row,
        debit,
        credit,
        computedBalance,
        shownBalance: row.balance !== undefined && row.balance !== null ? toNumber(row.balance) : computedBalance,
      });
      return rows;
    }, []);
  }, [ledger]);

  const finance = (() => {
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
  })();

  const visibleRows = viewMode === "bank"
    ? normalizedLedger.filter((r) => r.source_type === "receipt" || r.source_type === "payment")
    : normalizedLedger;

  const bankRows = useMemo(() => {
    return normalizedLedger
      .filter((row) => row.source_type === "receipt" || row.source_type === "payment")
      .reduce((rows, row) => {
        const previousBalance = rows.at(-1)?.cashBalance || 0;
        const inflow = row.source_type === "receipt" ? toNumber(row.credit || row.amount) : 0;
        const outflow = row.source_type === "payment" ? toNumber(row.debit || row.amount) : 0;
        rows.push({ ...row, inflow, outflow, cashBalance: previousBalance + inflow - outflow });
        return rows;
      }, []);
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
        ? tr(
            "پیگیری مطالبات و ثبت نتیجه تماس پیشنهاد می‌شود.",
            "يُنصح بمتابعة المستحقات وتسجيل نتيجة الاتصال.",
            "Alacakların takibi ve görüşme sonucunun kaydedilmesi önerilir.",
            "Follow up receivables and log the call result."
          )
        : normalizedLedger.length === 0
        ? tr(
            "برای این مشتری هنوز گردش مالی ثبت نشده است؛ اولین تعامل را ثبت کن.",
            "لم يتم تسجيل أي نشاط مالي لهذا العميل بعد؛ سجّل أول تفاعل.",
            "Bu müşteri için henüz finansal hareket kaydedilmedi; ilk etkileşimi kaydedin.",
            "No financial activity yet; register the first interaction."
          )
        : tr(
            "ارتباط با مشتری حفظ شود و پیشنهاد خرید مجدد ارسال گردد.",
            "حافظ على التواصل مع العميل وأرسل عرض إعادة الشراء.",
            "Müşteri ile iletişim sürdürülmeli ve yeniden sipariş teklifi gönderilmelidir.",
            "Maintain relationship and send a reorder proposal."
          );

    const levelLabels = {
      vip: tr("ویژه", "مميز", "VIP", "VIP"),
      active: tr("فعال", "نشط", "Aktif", "Active"),
      followup: tr("نیازمند پیگیری", "يحتاج إلى متابعة", "Takip gerekiyor", "Needs follow-up"),
      normal: tr("عادی", "عادي", "Normal", "Normal"),
    };

    return { score, level, levelLabel: levelLabels[level] || level, suggestion };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party, normalizedLedger, finance, language]);

  const crmTimeline = useMemo(() => {
    const ledgerEvents = normalizedLedger.slice(-8).map((row) => ({
      id: `ledger-${row.id || row.source_id || row.date || row.created_at || row.description || "item"}`,
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
      <div dir={dir} className="text-[var(--erp-accent)] p-8">
        {tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}
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
          className="inline-flex mt-4 px-4 py-3 rounded-xl bg-[var(--erp-accent)] text-slate-950 font-black"
        >
          {tr("بازگشت", "رجوع", "Geri", "Back")}
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
            className="px-4 py-3 rounded-2xl bg-[var(--erp-accent)] text-slate-950 font-black flex items-center gap-2"
          >
            <ArrowLeft size={18} />
            {tr("بازگشت", "رجوع", "Geri", "Back")}
          </Link>

          <button
            onClick={printPage}
            className="px-4 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-black flex items-center gap-2"
          >
            <Printer size={18} />
            {tr("چاپ پرونده", "طباعة الملف", "Dosyayı yazdır", "Print")}
          </button>

          <button
            onClick={openWhatsApp}
            className="px-4 py-3 rounded-2xl bg-emerald-500/20 text-emerald-200 font-black flex items-center gap-2 border border-emerald-400/20"
          >
            <MessageCircle size={18} />
            {tr("واتساپ", "واتساب", "WhatsApp", "WhatsApp")}
          </button>

          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-black flex items-center gap-2 disabled:opacity-60"
          >
            <RefreshCcw size={18} />
            {tr("به‌روزرسانی", "تحديث", "Yenile", "Refresh")}
          </button>

          {portalEnabled ? (
            <button
              onClick={revokePortalLink}
              disabled={portalBusy}
              className="px-4 py-3 rounded-2xl bg-red-500/15 text-red-200 font-black flex items-center gap-2 border border-red-400/20 disabled:opacity-60"
            >
              <ShieldOff size={18} />
              {tr("لغو پورتال مشتری", "إلغاء بوابة العميل", "Müşteri portalını iptal et", "Revoke customer portal")}
            </button>
          ) : (
            <button
              onClick={generatePortalLink}
              disabled={portalBusy}
              className="px-4 py-3 rounded-2xl bg-indigo-500/15 text-indigo-200 font-black flex items-center gap-2 border border-indigo-400/20 disabled:opacity-60"
            >
              <Link2 size={18} />
              {tr("ساخت لینک پورتال مشتری", "إنشاء رابط بوابة العميل", "Müşteri portal bağlantısı oluştur", "Create customer portal link")}
            </button>
          )}

          {(party.customer_type === "supplier" || party.customer_type === "both") && (
            supplierPortalEnabled ? (
              <button
                onClick={revokeSupplierPortalLink}
                disabled={supplierPortalBusy}
                className="px-4 py-3 rounded-2xl bg-red-500/15 text-red-200 font-black flex items-center gap-2 border border-red-400/20 disabled:opacity-60"
              >
                <ShieldOff size={18} />
                {tr("لغو پورتال تأمین‌کننده", "إلغاء بوابة المورد", "Tedarikçi portalını iptal et", "Revoke supplier portal")}
              </button>
            ) : (
              <button
                onClick={generateSupplierPortalLink}
                disabled={supplierPortalBusy}
                className="px-4 py-3 rounded-2xl bg-teal-500/15 text-teal-200 font-black flex items-center gap-2 border border-teal-400/20 disabled:opacity-60"
              >
                <Link2 size={18} />
                {tr("ساخت لینک پورتال تأمین‌کننده", "إنشاء رابط بوابة المورد", "Tedarikçi portal bağlantısı oluştur", "Create supplier portal link")}
              </button>
            )
          )}
        </div>

        <div className="text-right">
          <h1 className="text-4xl font-black text-[var(--erp-accent)]">
            {tr("پرونده ۳۶۰ درجه طرف‌حساب", "ملف العميل الشامل 360", "Müşteri 360 Derece Profili", "Customer 360 Profile")}
          </h1>
          <p className="text-[var(--erp-muted)] mt-2">
            {tr(
              `پرونده کامل مالی، CRM، پیگیری و ارتباطات طرف‌حساب #${n(party.id)}`,
              `ملف مالي وCRM ومتابعة واتصالات كامل للعميل رقم #${n(party.id)}`,
              `Cari için tam finans, CRM, takip ve iletişim dosyası #${n(party.id)}`,
              `Complete finance and CRM profile #${party.id}`
            )}
          </p>
        </div>
      </div>

      {portalLink && (
        <div className="bg-indigo-500/10 border border-indigo-400/20 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex-1 min-w-[240px] font-mono text-sm text-indigo-200 break-all">{portalLink}</div>
          <button
            onClick={copyPortalLink}
            className="px-4 py-2 rounded-xl bg-indigo-400 text-slate-950 font-black flex-shrink-0"
          >
            {tr("کپی لینک", "نسخ الرابط", "Bağlantıyı kopyala", "Copy link")}
          </button>
        </div>
      )}

      {supplierPortalLink && (
        <div className="bg-teal-500/10 border border-teal-400/20 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex-1 min-w-[240px] font-mono text-sm text-teal-200 break-all">{supplierPortalLink}</div>
          <button
            onClick={copySupplierPortalLink}
            className="px-4 py-2 rounded-xl bg-teal-400 text-slate-950 font-black flex-shrink-0"
          >
            {tr("کپی لینک", "نسخ الرابط", "Bağlantıyı kopyala", "Copy link")}
          </button>
        </div>
      )}

      <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-3xl font-black text-[var(--erp-text)]">{party.name}</h2>
            <div className="text-[var(--erp-accent)] font-bold mt-1">
              {
                {
                  customer: tr("مشتری", "عميل", "Müşteri", "Customer"),
                  supplier: tr("تامین‌کننده", "مورد", "Tedarikçi", "Supplier"),
                  both: tr("مشتری و تامین‌کننده", "عميل ومورد", "Müşteri ve Tedarikçi", "Customer & supplier"),
                }[party.customer_type || "customer"] || tr("مشتری", "عميل", "Müşteri", "Customer")
              }
            </div>
          </div>
          <div className="w-16 h-16 rounded-3xl bg-[var(--erp-glow)] text-[var(--erp-accent)] flex items-center justify-center">
            <UserRound size={34} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Info icon={<Phone size={17} />} label={tr("شماره تماس", "رقم الهاتف", "Telefon Numarası", "Phone")} value={(language === "fa" ? toPersianDigits(party.phone) : party.phone) || "-"} />
          <Info icon={<Mail size={17} />} label={tr("ایمیل", "البريد الإلكتروني", "E-posta", "Email")} value={party.email || "-"} />
          <Info icon={<MapPin size={17} />} label={tr("شهر", "المدينة", "Şehir", "City")} value={party.city || "-"} />
          <Info icon={<MapPin size={17} />} label={tr("آدرس", "العنوان", "Adres", "Address")} value={party.address || "-"} />
          <Info icon={<CreditCard size={17} />} label={tr("کد ملی/شناسه", "الرقم الوطني/المعرف", "Kimlik/Vergi No", "National ID")} value={party.national_id || "-"} />
          <Info icon={<CreditCard size={17} />} label={tr("کد اقتصادی", "الرمز الاقتصادي", "Vergi Kodu", "Economic Code")} value={party.economic_code || "-"} />
          <Info icon={<UserRound size={17} />} label={tr("شخص رابط", "الشخص المسؤول", "İlgili Kişi", "Contact")} value={party.contact_person || "-"} />
          <Info icon={<Wallet size={17} />} label={tr("سقف اعتبار", "حد الائتمان", "Kredi Limiti", "Credit Limit")} value={money(toNumber(party.credit_limit))} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <Kpi
          title={tr("مانده حساب", "الرصيد", "Bakiye", "Balance")}
          value={money(Math.abs(finance.balance))}
          hint={tr(
            `${party.name} ${balanceLabel(finance.balance, language)} است`,
            balanceLabel(finance.balance, language),
            balanceLabel(finance.balance, language),
            balanceLabel(finance.balance, language)
          )}
          color={finance.balance === 0 ? "#22d3ee" : undefined}
          colorClassName={finance.balance > 0 ? "text-red-300" : finance.balance < 0 ? "text-green-300" : undefined}
          icon={<Wallet size={20} />}
        />
        <Kpi title={tr("بدهکار", "مدين", "Borçlu", "Debtor")} value={money(finance.debtor)} colorClassName="text-red-300" icon={<Wallet size={20} />} />
        <Kpi title={tr("بستانکار", "دائن", "Alacaklı", "Creditor")} value={money(finance.creditor)} colorClassName="text-green-300" icon={<Wallet size={20} />} />
        <Kpi title={tr("مانده اول دوره", "الرصيد الافتتاحي", "Açılış Bakiyesi", "Opening")} value={money(Math.abs(finance.opening))} hint={balanceLabel(finance.opening, language)} color="#22d3ee" icon={<Wallet size={20} />} />
        <Kpi title={tr("آخرین فعالیت", "آخر نشاط", "Son İşlem", "Last activity")} value={finance.lastActivity ? formatDate(finance.lastActivity.date || finance.lastActivity.created_at) : "-"} icon={<Clock size={20} />} />
        <Kpi title={tr("تعداد تراکنش", "عدد المعاملات", "İşlem Sayısı", "Transactions")} value={n(normalizedLedger.length)} icon={<ArrowRightLeft size={20} />} />
        <Kpi title={tr("جمع بدهکار", "إجمالي المدين", "Toplam Borç", "Total debit")} value={money(finance.totalDebit)} icon={<ArrowRightLeft size={20} />} />
        <Kpi title={tr("جمع بستانکار", "إجمالي الدائن", "Toplam Alacak", "Total credit")} value={money(finance.totalCredit)} icon={<ArrowRightLeft size={20} />} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-5">
        <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
            <h2 className="text-2xl font-black text-[var(--erp-accent)] flex items-center gap-2">
              <Sparkles size={24} />
              {tr("هوش ارتباط با مشتری", "ذكاء العميل", "Müşteri Zekası", "Customer Intelligence")}
            </h2>
            <span className={`px-4 py-2 rounded-2xl font-black ${customerIntelligence.score >= 80 ? "bg-yellow-400/10 text-yellow-300" : customerIntelligence.score >= 60 ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>
              <Star size={16} className="inline mx-1" /> {n(customerIntelligence.score)}/100
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <Info icon={<BellRing size={17} />} label={tr("پیگیری بعدی", "المتابعة القادمة", "Sonraki Takip", "Next follow-up")} value={followupDate ? date(followupDate) : tr("ثبت نشده", "غير محدد", "Belirtilmedi", "Not set")} />
            <Info icon={<CheckCircle2 size={17} />} label={tr("وضعیت CRM", "حالة CRM", "CRM Durumu", "CRM Status")} value={customerIntelligence.levelLabel} />
            <Info icon={<MessageCircle size={17} />} label={tr("یادداشت‌ها", "الملاحظات", "Notlar", "Notes")} value={n(crmNotes.length)} />
          </div>

          <div className="rounded-2xl bg-[var(--erp-glow)] border border-[var(--erp-border)] p-4 text-[var(--erp-accent)] font-bold mb-5">
            {customerIntelligence.suggestion}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3 mb-4">
            <JalaliDateField
              value={followupDate}
              onChange={saveFollowupDate}
              fa={language === "fa"}
              language={language}
              className="bg-[var(--erp-panel-solid)] text-[var(--erp-text)] rounded-2xl p-4 outline-none border border-[var(--erp-border)]"
            />
            <button
              onClick={openWhatsApp}
              className="bg-emerald-500/20 text-emerald-200 border border-emerald-400/20 rounded-2xl font-black flex items-center justify-center gap-2"
            >
              <MessageCircle size={18} />
              {tr("پیام آماده واتساپ", "رسالة واتساب جاهزة", "Hazır WhatsApp Mesajı", "WhatsApp message")}
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
              onChange={(e) => setNewNote(language === "fa" ? toPersianDigits(e.target.value) : e.target.value)}
              rows={3}
              className="bg-[var(--erp-panel-solid)] text-[var(--erp-text)] rounded-2xl p-4 outline-none border border-[var(--erp-border)]"
              placeholder={tr(
                "یادداشت تماس، مذاکره، قول پرداخت یا درخواست مشتری...",
                "ملاحظة اتصال، مفاوضة، وعد بالدفع أو طلب العميل...",
                "Görüşme notu, müzakere, ödeme sözü veya müşteri talebi...",
                "Call note, negotiation, payment promise or customer request..."
              )}
            />
            <button
              onClick={addCrmNote}
              className="bg-[var(--erp-accent)] text-slate-950 rounded-2xl font-black flex items-center justify-center gap-2"
            >
              <Plus size={18} />
              {tr("ثبت", "إضافة", "Ekle", "Add")}
            </button>
          </div>
        </div>

        <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5">
          <h2 className="text-2xl font-black text-[var(--erp-accent)] flex items-center gap-2 mb-5">
            <Clock size={24} />
            {tr("تایم‌لاین مشتری", "الجدول الزمني للعميل", "Müşteri Zaman Çizelgesi", "Customer timeline")}
          </h2>
          <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
            {crmTimeline.map((event) => (
              <div key={event.id} className="rounded-2xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="text-[var(--erp-text)] font-black text-sm">{event.title}</div>
                  <span className={`text-xs px-2 py-1 rounded-full ${event.type === "crm" ? "bg-cyan-400/10 text-cyan-300" : "bg-emerald-400/10 text-emerald-300"}`}>
                    {event.type === "crm" ? "CRM" : tr("مالی", "مالي", "Finansal", "Finance")}
                  </span>
                </div>
                <div className="text-xs text-[var(--erp-muted)] flex items-center justify-between gap-2">
                  <span>{formatDate(event.date)}</span>
                  {event.amount ? <b className="text-[var(--erp-accent)]">{money(event.amount)}</b> : null}
                </div>
              </div>
            ))}

            {crmTimeline.length === 0 && (
              <div className="text-[var(--erp-muted)]">{tr("هنوز رویدادی ثبت نشده است.", "لم يتم تسجيل أي حدث بعد.", "Henüz bir olay kaydedilmedi.", "No timeline events yet.")}</div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5">
        <div className="flex flex-wrap justify-between gap-3 mb-5">
          <h2 className="text-2xl font-black text-[var(--erp-accent)] flex items-center gap-2">
            <FileText size={24} />
            {tr("صورت‌حساب", "كشف الحساب", "Hesap Ekstresi", "Ledger")}
          </h2>

          <div className="flex gap-2">
            <button
              onClick={() => setViewMode("all")}
              className={`px-4 py-2 rounded-xl font-black ${
                viewMode === "all" ? "bg-[var(--erp-accent)] text-slate-950" : "bg-[var(--erp-panel-solid)] text-[var(--erp-text)]"
              }`}
            >
              {tr("دفتر کل", "الكل", "Tümü", "All")}
            </button>

            <button
              onClick={() => setViewMode("bank")}
              className={`px-4 py-2 rounded-xl font-black ${
                viewMode === "bank" ? "bg-[var(--erp-accent)] text-slate-950" : "bg-[var(--erp-panel-solid)] text-[var(--erp-text)]"
              }`}
            >
              {tr("ریزگردش بانکی", "الحركة البنكية", "Banka Hareketi", "Bank")}
            </button>
          </div>
        </div>

        {viewMode === "all" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-[var(--erp-accent)] border-b border-[var(--erp-border)]">
                  <th className="p-3 text-right">{tr("تاریخ", "التاريخ", "Tarih", "Date")}</th>
                  <th className="p-3 text-right">{tr("شرح", "البيان", "Açıklama", "Description")}</th>
                  <th className="p-3 text-right">{tr("بدهکار", "مدين", "Borç", "Debit")}</th>
                  <th className="p-3 text-right">{tr("بستانکار", "دائن", "Alacak", "Credit")}</th>
                  <th className="p-3 text-right">{tr("مانده حساب", "رصيد الحساب", "Hesap Bakiyesi", "Account balance")}</th>
                  <th className="p-3 text-right">{tr("وضعیت", "الحالة", "Durum", "Status")}</th>
                </tr>
              </thead>

              <tbody>
                {visibleRows.map((row, index) => {
                  const bal = toNumber(row.computedBalance ?? getRowBalance(row));

                  return (
                    <tr key={`${row.id}-${index}`} className="border-b border-[var(--erp-border)] hover:bg-cyan-500/5">
                      <td className="p-3 text-[var(--erp-text)]">{formatDate(row.date || row.created_at)}</td>
                      <td className="p-3">
                        <div className="font-black text-[var(--erp-text)]">
                          {row.description || sourceLabel(row.source_type, language)}
                        </div>
                        <div className="text-xs text-[var(--erp-muted)]">
                          {sourceLabel(row.source_type, language)} {row.source_id ? `#${n(row.source_id)}` : ""}
                        </div>
                      </td>
                      <td className="p-3 text-rose-300 font-black">
                        {toNumber(row.debit) ? money(row.debit) : "-"}
                      </td>
                      <td className="p-3 text-emerald-300 font-black">
                        {toNumber(row.credit) ? money(row.credit) : "-"}
                      </td>
                      <td className="p-3 text-[var(--erp-accent)] font-black">{money(Math.abs(bal))}</td>
                      <td className="p-3 text-[var(--erp-text)] font-black">{balanceLabel(bal, language)}</td>
                    </tr>
                  );
                })}

                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-[var(--erp-muted)]">
                      {tr("هنوز گردش حسابی ثبت نشده است", "لم يتم تسجيل أي حركة حساب بعد", "Henüz hesap hareketi kaydedilmedi", "No ledger rows")}
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
                <tr className="text-[var(--erp-accent)] border-b border-[var(--erp-border)]">
                  <th className="p-3 text-right">{tr("تاریخ", "التاريخ", "Tarih", "Date")}</th>
                  <th className="p-3 text-right">{tr("شرح عملیات بانکی", "بيان العملية البنكية", "Banka İşlemi Açıklaması", "Bank transaction")}</th>
                  <th className="p-3 text-right">{tr("ورود وجه", "الوارد", "Giren Tutar", "Inflow")}</th>
                  <th className="p-3 text-right">{tr("خروج وجه", "الصادر", "Çıkan Tutar", "Outflow")}</th>
                  <th className="p-3 text-right">{tr("مانده نقد/بانک", "رصيد النقد/البنك", "Nakit/Banka Bakiyesi", "Cash/Bank balance")}</th>
                  <th className="p-3 text-right">{tr("نوع", "النوع", "Tür", "Type")}</th>
                </tr>
              </thead>

              <tbody>
                {bankRows.map((row, index) => (
                  <tr key={`${row.id}-${index}`} className="border-b border-[var(--erp-border)] hover:bg-cyan-500/5">
                    <td className="p-3 text-[var(--erp-text)]">{formatDate(row.date || row.created_at)}</td>
                    <td className="p-3">
                      <div className="font-black text-[var(--erp-text)]">
                        {row.description || sourceLabel(row.source_type, language)}
                      </div>
                      <div className="text-xs text-[var(--erp-muted)]">{row.source_id ? `#${n(row.source_id)}` : ""}</div>
                    </td>
                    <td className="p-3 text-emerald-300 font-black">{row.inflow ? money(row.inflow) : "-"}</td>
                    <td className="p-3 text-rose-300 font-black">{row.outflow ? money(row.outflow) : "-"}</td>
                    <td className="p-3 text-[var(--erp-accent)] font-black">{money(Math.abs(row.cashBalance))}</td>
                    <td className="p-3 text-[var(--erp-text)] font-black">{sourceLabel(row.source_type, language)}</td>
                  </tr>
                ))}

                {bankRows.length === 0 && (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-[var(--erp-muted)]">
                      {tr("هنوز دریافت یا پرداخت بانکی ثبت نشده است", "لم يتم تسجيل أي قبض أو دفع بنكي بعد", "Henüz banka tahsilatı veya ödemesi kaydedilmedi", "No bank transaction has been registered yet")}
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
    <div className="bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] rounded-2xl p-4">
      <div className="text-[var(--erp-muted)] text-xs flex items-center gap-2 mb-2">
        {icon}
        {label}
      </div>
      <div className="text-[var(--erp-text)] font-black">{value}</div>
    </div>
  );
}

function Kpi({ title, value, hint, color = "#22d3ee", colorClassName, icon }) {
  return (
    <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-[var(--erp-muted)] font-bold mb-3">{title}</div>
          <div className={`text-3xl font-black${colorClassName ? ` ${colorClassName}` : ""}`} style={colorClassName ? undefined : { color }}>
            {value}
          </div>
          {hint && (
            <div className={`text-xs mt-2${colorClassName ? ` ${colorClassName}` : ""}`} style={colorClassName ? undefined : { color }}>
              {hint}
            </div>
          )}
        </div>
        <div className="text-[var(--erp-accent)] bg-[var(--erp-glow)] w-10 h-10 rounded-2xl flex items-center justify-center">
          {icon}
        </div>
      </div>
    </div>
  );
}
