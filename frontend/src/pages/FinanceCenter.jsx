import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  Building2,
  CreditCard,
  Download,
  Landmark,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  Repeat,
  AlertTriangle,
} from "lucide-react";
import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits } from "../localization/helpers";
import { API_URL, getAuthHeaders } from "../services/api";


const demoAccounts = [
  { id: 1, name: "صندوق اصلی", type: "cash", balance: 25000000, color: "#22d3ee" },
  { id: 2, name: "بانک ملت", type: "bank", balance: 68000000, color: "#10b981" },
  { id: 3, name: "کیف پول مدیر", type: "wallet", balance: 8500000, color: "#f59e0b" },
];

const demoTransactions = [
  { id: 1, type: "income", amount: 4200000, account_name: "بانک ملت", description: "دریافت بابت فاکتور فروش", created_at: new Date().toISOString() },
  { id: 2, type: "expense", amount: 1350000, account_name: "صندوق اصلی", description: "پرداخت هزینه حمل", created_at: new Date().toISOString() },
  { id: 3, type: "transfer", amount: 5000000, account_name: "صندوق اصلی ← بانک ملت", description: "انتقال داخلی", created_at: new Date().toISOString() },
];

function toNumber(value) {
  return Number(
    String(value ?? "")
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .replace(/[,،]/g, "")
      .replace(/[^\d.-]/g, "") || 0
  );
}

function accountTypeLabel(type, language) {
  const mapFa = { cash: "صندوق", bank: "بانک", wallet: "کیف پول", card: "کارت", other: "سایر" };
  const mapAr = { cash: "الصندوق", bank: "البنك", wallet: "المحفظة", card: "البطاقة", other: "أخرى" };
  const mapTr = { cash: "Kasa", bank: "Banka", wallet: "Cüzdan", card: "Kart", other: "Diğer" };
  const mapEn = { cash: "Cash", bank: "Bank", wallet: "Wallet", card: "Card", other: "Other" };
  const map = language === "fa" ? mapFa : language === "ar" ? mapAr : language === "tr" ? mapTr : mapEn;
  return map[type] || type;
}

function transactionTypeLabel(type, language) {
  const mapFa = { income: "دریافت", expense: "پرداخت", transfer: "انتقال" };
  const mapAr = { income: "مقبوضات", expense: "مدفوعات", transfer: "تحويل" };
  const mapTr = { income: "Tahsilat", expense: "Ödeme", transfer: "Transfer" };
  const mapEn = { income: "Income", expense: "Expense", transfer: "Transfer" };
  const map = language === "fa" ? mapFa : language === "ar" ? mapAr : language === "tr" ? mapTr : mapEn;
  return map[type] || type;
}

function typeIcon(type) {
  if (type === "income") return <ArrowUpRight size={18} />;
  if (type === "expense") return <ArrowDownRight size={18} />;
  return <Repeat size={18} />;
}

export default function FinanceCenter() {
  const { language, dir, money, n, date } = useLanguage();
  const fa = language === "fa";

  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);

  const [accountForm, setAccountForm] = useState({
    name: "",
    type: "cash",
    opening_balance: "",
  });

  const [transactionForm, setTransactionForm] = useState({
    type: "income",
    account_id: "",
    to_account_id: "",
    amount: "",
    description: "",
  });

  async function api(path, options = {}) {
    const { headers, ...requestOptions } = options;
    const res = await fetch(`${API_URL}${path}`, {
      ...requestOptions,
      headers: getAuthHeaders(headers),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.status === "error") {
      throw new Error(data?.message || data?.detail || `API ${res.status}`);
    }
    return data;
  }

  async function loadFinance() {
    try {
      setLoading(true);
      setMessage("");
      setOfflineMode(false);

      const [acc, tx, sum] = await Promise.all([
        api("/finance/accounts"),
        api("/finance/transactions"),
        api("/finance/summary"),
      ]);

      setAccounts(Array.isArray(acc) ? acc : []);
      setTransactions(Array.isArray(tx) ? tx : []);
      setSummary(sum || null);
    } catch (error) {
      console.warn("Finance API not ready, using demo mode:", error);
      setOfflineMode(true);
      setAccounts(demoAccounts);
      setTransactions(demoTransactions);
      setSummary(null);
      setMessage(
        language === "fa"
          ? "فعلاً API مرکز مالی فعال نیست؛ صفحه در حالت نمایشی اجرا شده است."
          : language === "ar"
          ? "واجهة برمجة مركز المالية غير مفعّلة بعد؛ الصفحة تعمل في وضع العرض التوضيحي."
          : language === "tr"
          ? "Finans Merkezi API'si henüz etkin değil; sayfa demo modunda çalışıyor."
          : "Finance API is not active yet; running in demo mode."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialTimer = setTimeout(() => { void loadFinance(); }, 0);
    return () => clearTimeout(initialTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const totals = useMemo(() => {
    const totalBalance = accounts.reduce((sum, a) => sum + toNumber(a.balance ?? a.opening_balance), 0);
    const incomeToday = transactions
      .filter((x) => x.type === "income")
      .reduce((sum, x) => sum + toNumber(x.amount), 0);
    const expenseToday = transactions
      .filter((x) => x.type === "expense")
      .reduce((sum, x) => sum + toNumber(x.amount), 0);
    const transferTotal = transactions
      .filter((x) => x.type === "transfer")
      .reduce((sum, x) => sum + toNumber(x.amount), 0);

    return {
      totalBalance: summary?.total_balance ?? totalBalance,
      incomeToday: summary?.income_today ?? incomeToday,
      expenseToday: summary?.expense_today ?? expenseToday,
      netToday: summary?.net_today ?? incomeToday - expenseToday,
      transferTotal,
      accountsCount: accounts.length,
    };
  }, [accounts, transactions, summary]);

  const filteredTransactions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return transactions;
    return transactions.filter((x) =>
      [x.description, x.account_name, x.type, x.amount, x.created_at]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [transactions, query]);

  async function createAccount() {
    if (!accountForm.name.trim()) {
      setMessage(language === "fa" ? "نام حساب را وارد کن." : language === "ar" ? "أدخل اسم الحساب." : language === "tr" ? "Hesap adını girin." : "Enter account name.");
      return;
    }

    const payload = {
      name: accountForm.name.trim(),
      type: accountForm.type,
      opening_balance: toNumber(accountForm.opening_balance),
    };

    try {
      if (offlineMode) {
        const newItem = {
          id: Date.now(),
          name: payload.name,
          type: payload.type,
          balance: payload.opening_balance,
          color: "#22d3ee",
        };
        setAccounts((prev) => [newItem, ...prev]);
      } else {
        await api("/finance/accounts", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        await loadFinance();
      }

      setShowAccountForm(false);
      setAccountForm({ name: "", type: "cash", opening_balance: "" });
      setMessage(language === "fa" ? "حساب مالی ثبت شد." : language === "ar" ? "تم إنشاء الحساب." : language === "tr" ? "Hesap oluşturuldu." : "Account created.");
    } catch (error) {
      setMessage(error.message || (language === "fa" ? "خطا در ثبت حساب" : language === "ar" ? "خطأ في إنشاء الحساب" : language === "tr" ? "Hesap oluşturma hatası" : "Account error"));
    }
  }

  async function createTransaction() {
    if (!transactionForm.account_id && accounts.length > 0) {
      setMessage(language === "fa" ? "حساب مالی را انتخاب کن." : language === "ar" ? "اختر حسابًا." : language === "tr" ? "Bir hesap seçin." : "Select an account.");
      return;
    }
    if (toNumber(transactionForm.amount) <= 0) {
      setMessage(language === "fa" ? "مبلغ معتبر وارد کن." : language === "ar" ? "أدخل مبلغًا صحيحًا." : language === "tr" ? "Geçerli bir tutar girin." : "Enter a valid amount.");
      return;
    }

    const payload = {
      type: transactionForm.type,
      account_id: transactionForm.account_id ? Number(transactionForm.account_id) : accounts[0]?.id,
      to_account_id: transactionForm.to_account_id ? Number(transactionForm.to_account_id) : null,
      amount: toNumber(transactionForm.amount),
      description: transactionForm.description,
    };

    try {
      if (offlineMode) {
        const account = accounts.find((a) => String(a.id) === String(payload.account_id));
        const toAccount = accounts.find((a) => String(a.id) === String(payload.to_account_id));

        setTransactions((prev) => [
          {
            id: Date.now(),
            type: payload.type,
            amount: payload.amount,
            account_name:
              payload.type === "transfer"
                ? `${account?.name || "-"} ← ${toAccount?.name || "-"}`
                : account?.name || "-",
            description: payload.description || transactionTypeLabel(payload.type, language),
            created_at: new Date().toISOString(),
          },
          ...prev,
        ]);

        setAccounts((prev) =>
          prev.map((a) => {
            if (payload.type === "income" && String(a.id) === String(payload.account_id)) {
              return { ...a, balance: toNumber(a.balance) + payload.amount };
            }
            if (payload.type === "expense" && String(a.id) === String(payload.account_id)) {
              return { ...a, balance: toNumber(a.balance) - payload.amount };
            }
            if (payload.type === "transfer" && String(a.id) === String(payload.account_id)) {
              return { ...a, balance: toNumber(a.balance) - payload.amount };
            }
            if (payload.type === "transfer" && String(a.id) === String(payload.to_account_id)) {
              return { ...a, balance: toNumber(a.balance) + payload.amount };
            }
            return a;
          })
        );
      } else {
        await api("/finance/transactions", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        await loadFinance();
      }

      setShowTransactionForm(false);
      setTransactionForm({
        type: "income",
        account_id: "",
        to_account_id: "",
        amount: "",
        description: "",
      });
      setMessage(language === "fa" ? "تراکنش ثبت شد." : language === "ar" ? "تم إنشاء المعاملة." : language === "tr" ? "İşlem oluşturuldu." : "Transaction created.");
    } catch (error) {
      setMessage(error.message || (language === "fa" ? "خطا در ثبت تراکنش" : language === "ar" ? "خطأ في إنشاء المعاملة" : language === "tr" ? "İşlem oluşturma hatası" : "Transaction error"));
    }
  }

  function exportCsv() {
    const rows = [
      ["Date", "Type", "Account", "Description", "Amount"],
      ...filteredTransactions.map((x) => [
        x.created_at || "",
        x.type || "",
        x.account_name || "",
        x.description || "",
        x.amount || 0,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "vetrix-finance-transactions.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <div
      dir={dir}
      className="min-h-screen p-6 space-y-6"
      style={{
        direction: dir,
        background:
          "radial-gradient(circle at top left, rgba(34,211,238,0.16), transparent 35%), radial-gradient(circle at top right, rgba(16,185,129,0.14), transparent 35%), var(--erp-bg)",
      }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-black text-[var(--erp-accent)]">
            {fa
              ? "مرکز مالی Vetrix"
              : language === "ar"
              ? "مركز Vetrix المالي"
              : language === "tr"
              ? "Vetrix Finans Merkezi"
              : "Vetrix Finance Center"}
          </h1>
          <p className="text-[var(--erp-muted)] mt-2">
            {fa
              ? "مدیریت صندوق، بانک، کیف پول، دریافت، پرداخت، انتقال و نقدینگی لحظه‌ای"
              : language === "ar"
              ? "إدارة الصندوق والبنك والمحفظة والمقبوضات والمدفوعات والتحويلات والسيولة اللحظية"
              : language === "tr"
              ? "Kasa, banka, cüzdan, tahsilat, ödeme, transfer ve anlık likiditeyi yönetin"
              : "Manage cash, banks, wallets, receipts, payments, transfers and live liquidity"}
          </p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={loadFinance}
            disabled={loading}
            className="px-4 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-bold flex items-center gap-2 border border-[var(--erp-border)] disabled:opacity-60"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            {fa ? "به‌روزرسانی" : language === "ar" ? "تحديث" : language === "tr" ? "Yenile" : "Refresh"}
          </button>

          <button
            onClick={() => setShowAccountForm(true)}
            className="px-4 py-3 rounded-2xl bg-[var(--erp-accent)] text-slate-950 font-black flex items-center gap-2"
          >
            <Plus size={18} />
            {fa ? "حساب جدید" : language === "ar" ? "حساب جديد" : language === "tr" ? "Yeni hesap" : "New account"}
          </button>

          <button
            onClick={() => setShowTransactionForm(true)}
            className="px-4 py-3 rounded-2xl bg-emerald-400 text-slate-950 font-black flex items-center gap-2"
          >
            <Send size={18} />
            {fa ? "تراکنش جدید" : language === "ar" ? "معاملة جديدة" : language === "tr" ? "Yeni işlem" : "New transaction"}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-2xl p-4 flex items-center gap-2 ${
            offlineMode
              ? "bg-amber-500/10 border border-amber-400/20 text-amber-200"
              : "bg-[var(--erp-glow)] border border-[var(--erp-border)] text-[var(--erp-accent)]"
          }`}
        >
          {offlineMode ? <AlertTriangle size={18} /> : <ShieldCheck size={18} />}
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <FinanceCard
          title={fa ? "کل نقدینگی" : language === "ar" ? "إجمالي السيولة" : language === "tr" ? "Toplam likidite" : "Total liquidity"}
          value={money(totals.totalBalance)}
          icon={<Wallet />}
          color="text-[var(--erp-accent)]"
        />
        <FinanceCard
          title={fa ? "دریافت‌ها" : language === "ar" ? "المقبوضات" : language === "tr" ? "Tahsilatlar" : "Receipts"}
          value={money(totals.incomeToday)}
          icon={<ArrowUpRight />}
          color="text-emerald-300"
        />
        <FinanceCard
          title={fa ? "پرداخت‌ها" : language === "ar" ? "المدفوعات" : language === "tr" ? "Ödemeler" : "Payments"}
          value={money(totals.expenseToday)}
          icon={<ArrowDownRight />}
          color="text-rose-300"
        />
        <FinanceCard
          title={fa ? "خالص امروز" : language === "ar" ? "صافي اليوم" : language === "tr" ? "Bugünkü net" : "Net today"}
          value={money(totals.netToday)}
          icon={<Banknote />}
          color={toNumber(totals.netToday) >= 0 ? "text-[var(--erp-accent)]" : "text-rose-300"}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[390px_1fr] gap-6">
        <Panel title={fa ? "حساب‌های مالی" : language === "ar" ? "الحسابات المالية" : language === "tr" ? "Finansal hesaplar" : "Financial accounts"} icon={<Landmark />}>
          <div className="space-y-3">
            {accounts.map((account) => (
              <AccountCard key={account.id} account={account} language={language} money={money} />
            ))}
            {accounts.length === 0 && <Empty language={language} />}
          </div>
        </Panel>

        <Panel title={fa ? "تراکنش‌های مالی" : language === "ar" ? "المعاملات المالية" : language === "tr" ? "Finansal işlemler" : "Financial transactions"} icon={<CreditCard />}>
          <div className="flex gap-3 flex-wrap mb-4">
            <div className="flex items-center gap-2 bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] rounded-2xl px-4 py-3 flex-1 min-w-[260px]">
              <Search size={18} className="text-[var(--erp-accent)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  fa
                    ? "جستجو در تراکنش‌ها..."
                    : language === "ar"
                    ? "بحث في المعاملات..."
                    : language === "tr"
                    ? "İşlemlerde ara..."
                    : "Search transactions..."
                }
                className="bg-transparent outline-none text-[var(--erp-text)] placeholder-slate-500 w-full"
              />
            </div>

            <button
              onClick={exportCsv}
              className="px-4 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-bold flex items-center gap-2 border border-[var(--erp-border)]"
            >
              <Download size={18} />
              CSV
            </button>
          </div>

          <div className="space-y-3 max-h-[620px] overflow-auto pr-1">
            {filteredTransactions.map((item) => (
              <TransactionRow key={item.id} item={item} language={language} money={money} date={date} />
            ))}
            {filteredTransactions.length === 0 && <Empty language={language} />}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Panel title={fa ? "تحلیل نقدینگی" : language === "ar" ? "تحليل السيولة" : language === "tr" ? "Likidite analizi" : "Liquidity analysis"} icon={<Banknote />}>
          <AnalysisLine
            fa={fa}
            label={
              fa
                ? "نسبت پرداخت به دریافت"
                : language === "ar"
                ? "نسبة المدفوعات إلى المقبوضات"
                : language === "tr"
                ? "Ödeme / tahsilat oranı"
                : "Payment / receipt ratio"
            }
            value={
              totals.incomeToday > 0
                ? `${n(((totals.expenseToday / totals.incomeToday) * 100).toFixed(1))}%`
                : "0%"
            }
            status={totals.expenseToday <= totals.incomeToday ? "good" : "bad"}
          />
          <AnalysisLine
            fa={fa}
            label={fa ? "تعداد حساب‌ها" : language === "ar" ? "عدد الحسابات" : language === "tr" ? "Hesap sayısı" : "Accounts"}
            value={n(totals.accountsCount)}
            status="good"
          />
          <AnalysisLine
            fa={fa}
            label={fa ? "انتقال‌های داخلی" : language === "ar" ? "التحويلات الداخلية" : language === "tr" ? "Dahili transferler" : "Internal transfers"}
            value={money(totals.transferTotal)}
            status="info"
          />
        </Panel>

        <Panel title={fa ? "اقدامات سریع" : language === "ar" ? "إجراءات مالية سريعة" : language === "tr" ? "Hızlı finans işlemleri" : "Quick finance actions"} icon={<Plus />}>
          <button onClick={() => { setTransactionForm((p) => ({ ...p, type: "income" })); setShowTransactionForm(true); }} className="quick-btn bg-emerald-500/10 text-emerald-200 border-emerald-400/20">
            <ArrowUpRight size={18} />
            {fa ? "ثبت دریافت" : language === "ar" ? "تسجيل مقبوضات" : language === "tr" ? "Tahsilat kaydet" : "Record receipt"}
          </button>
          <button onClick={() => { setTransactionForm((p) => ({ ...p, type: "expense" })); setShowTransactionForm(true); }} className="quick-btn bg-rose-500/10 text-rose-200 border-rose-400/20">
            <ArrowDownRight size={18} />
            {fa ? "ثبت پرداخت" : language === "ar" ? "تسجيل مدفوعات" : language === "tr" ? "Ödeme kaydet" : "Record payment"}
          </button>
          <button onClick={() => { setTransactionForm((p) => ({ ...p, type: "transfer" })); setShowTransactionForm(true); }} className="quick-btn bg-[var(--erp-glow)] text-[var(--erp-accent)] border-[var(--erp-border)]">
            <Repeat size={18} />
            {fa ? "انتقال بین حساب‌ها" : language === "ar" ? "تحويل بين الحسابات" : language === "tr" ? "Hesaplar arası transfer" : "Transfer between accounts"}
          </button>
        </Panel>

        <Panel title={fa ? "وضعیت سیستم مالی" : language === "ar" ? "حالة النظام المالي" : language === "tr" ? "Finans sistemi durumu" : "Finance system status"} icon={<ShieldCheck />}>
          <div className="rounded-2xl bg-emerald-500/10 border border-emerald-400/20 p-4 text-emerald-200 font-bold">
            {fa
              ? "حساب‌ها و تراکنش‌ها به‌صورت واقعی ذخیره می‌شوند."
              : language === "ar"
              ? "يتم الآن حفظ الحسابات والمعاملات فعليًا."
              : language === "tr"
              ? "Hesaplar ve işlemler artık gerçek olarak kaydediliyor."
              : "Accounts and transactions are now saved for real."}
          </div>
          <div className="text-[var(--erp-muted)] text-sm leading-7 mt-3">
            {fa
              ? "مرحله بعدی: مدیریت چک، اقساط، سررسیدها و هشدارهای مالی."
              : language === "ar"
              ? "الخطوة التالية: إدارة الشيكات والأقساط ومواعيد الاستحقاق والتنبيهات المالية."
              : language === "tr"
              ? "Sıradaki adım: çek, taksit, vade tarihi ve finansal uyarı yönetimi."
              : "Next: checks, installments, due dates and finance alerts."}
          </div>
        </Panel>
      </div>

      {showAccountForm && (
        <Modal
          title={
            fa
              ? "حساب مالی جدید"
              : language === "ar"
              ? "حساب مالي جديد"
              : language === "tr"
              ? "Yeni finansal hesap"
              : "New financial account"
          }
          onClose={() => setShowAccountForm(false)}
        >
          <Field label={fa ? "نام حساب" : language === "ar" ? "اسم الحساب" : language === "tr" ? "Hesap adı" : "Account name"}>
            <input className="form-input" value={accountForm.name} onChange={(e) => setAccountForm((p) => ({ ...p, name: e.target.value }))} />
          </Field>

          <Field label={fa ? "نوع حساب" : language === "ar" ? "نوع الحساب" : language === "tr" ? "Hesap türü" : "Account type"}>
            <select className="form-input" value={accountForm.type} onChange={(e) => setAccountForm((p) => ({ ...p, type: e.target.value }))}>
              <option value="cash">{fa ? "صندوق" : language === "ar" ? "الصندوق" : language === "tr" ? "Kasa" : "Cash"}</option>
              <option value="bank">{fa ? "بانک" : language === "ar" ? "البنك" : language === "tr" ? "Banka" : "Bank"}</option>
              <option value="wallet">{fa ? "کیف پول" : language === "ar" ? "المحفظة" : language === "tr" ? "Cüzdan" : "Wallet"}</option>
              <option value="card">{fa ? "کارت" : language === "ar" ? "البطاقة" : language === "tr" ? "Kart" : "Card"}</option>
              <option value="other">{fa ? "سایر" : language === "ar" ? "أخرى" : language === "tr" ? "Diğer" : "Other"}</option>
            </select>
          </Field>

          <Field label={fa ? "مانده اولیه" : language === "ar" ? "الرصيد الافتتاحي" : language === "tr" ? "Açılış bakiyesi" : "Opening balance"}>
            <input className="form-input" value={accountForm.opening_balance} onChange={(e) => setAccountForm((p) => ({ ...p, opening_balance: e.target.value }))} />
          </Field>

          <button onClick={createAccount} className="w-full mt-4 px-4 py-3 rounded-2xl bg-[var(--erp-accent)] text-slate-950 font-black">
            {fa ? "ثبت حساب" : language === "ar" ? "إنشاء الحساب" : language === "tr" ? "Hesap oluştur" : "Create account"}
          </button>
        </Modal>
      )}

      {showTransactionForm && (
        <Modal
          title={
            fa
              ? "تراکنش مالی جدید"
              : language === "ar"
              ? "معاملة مالية جديدة"
              : language === "tr"
              ? "Yeni finans işlemi"
              : "New finance transaction"
          }
          onClose={() => setShowTransactionForm(false)}
        >
          <Field label={fa ? "نوع تراکنش" : language === "ar" ? "نوع المعاملة" : language === "tr" ? "İşlem türü" : "Transaction type"}>
            <select className="form-input" value={transactionForm.type} onChange={(e) => setTransactionForm((p) => ({ ...p, type: e.target.value }))}>
              <option value="income">{fa ? "دریافت" : language === "ar" ? "مقبوضات" : language === "tr" ? "Tahsilat" : "Income"}</option>
              <option value="expense">{fa ? "پرداخت" : language === "ar" ? "مدفوعات" : language === "tr" ? "Ödeme" : "Expense"}</option>
              <option value="transfer">{fa ? "انتقال" : language === "ar" ? "تحويل" : language === "tr" ? "Transfer" : "Transfer"}</option>
            </select>
          </Field>

          <Field
            label={
              transactionForm.type === "transfer"
                ? fa
                  ? "از حساب"
                  : language === "ar"
                  ? "من حساب"
                  : language === "tr"
                  ? "Kaynak hesap"
                  : "From account"
                : fa
                ? "حساب"
                : language === "ar"
                ? "الحساب"
                : language === "tr"
                ? "Hesap"
                : "Account"
            }
          >
            <select className="form-input" value={transactionForm.account_id} onChange={(e) => setTransactionForm((p) => ({ ...p, account_id: e.target.value }))}>
              <option value="">{fa ? "انتخاب حساب" : language === "ar" ? "اختر حسابًا" : language === "tr" ? "Hesap seçin" : "Select account"}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>

          {transactionForm.type === "transfer" && (
            <Field label={fa ? "به حساب" : language === "ar" ? "إلى حساب" : language === "tr" ? "Hedef hesap" : "To account"}>
              <select className="form-input" value={transactionForm.to_account_id} onChange={(e) => setTransactionForm((p) => ({ ...p, to_account_id: e.target.value }))}>
                <option value="">{fa ? "انتخاب حساب مقصد" : language === "ar" ? "اختر الحساب الهدف" : language === "tr" ? "Hedef hesabı seçin" : "Select target account"}</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>
          )}

          <Field label={fa ? "مبلغ" : language === "ar" ? "المبلغ" : language === "tr" ? "Tutar" : "Amount"}>
            <input className="form-input" value={transactionForm.amount} onChange={(e) => setTransactionForm((p) => ({ ...p, amount: e.target.value }))} />
          </Field>

          <Field label={fa ? "شرح" : language === "ar" ? "الوصف" : language === "tr" ? "Açıklama" : "Description"}>
            <textarea className="form-input" rows={3} value={transactionForm.description} onChange={(e) => setTransactionForm((p) => ({ ...p, description: fa ? toPersianDigits(e.target.value) : e.target.value }))} />
          </Field>

          <button onClick={createTransaction} className="w-full mt-4 px-4 py-3 rounded-2xl bg-emerald-400 text-slate-950 font-black">
            {fa ? "ثبت تراکنش" : language === "ar" ? "إنشاء المعاملة" : language === "tr" ? "İşlem oluştur" : "Create transaction"}
          </button>
        </Modal>
      )}

      <style>{`
        .quick-btn {
          width: 100%;
          padding: 14px;
          border-radius: 18px;
          border-width: 1px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-weight: 900;
          margin-bottom: 10px;
        }
        .form-input {
          width: 100%;
          background: var(--erp-panel-solid);
          color: var(--erp-text);
          border: 1px solid var(--erp-border);
          border-radius: 16px;
          padding: 12px;
          outline: none;
          margin-top: 6px;
        }
      `}</style>
    </div>
  );
}

function FinanceCard({ title, value, icon, color }) {
  return (
    <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5 shadow-xl">
      <div className="flex items-center gap-3 text-[var(--erp-accent)] mb-3">
        {icon}
        <span className="text-[var(--erp-muted)] font-bold">{title}</span>
      </div>
      <div className={`text-3xl font-black ${color}`}>{value}</div>
    </div>
  );
}

function Panel({ title, icon, children }) {
  return (
    <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5 shadow-xl">
      <h2 className="text-xl font-black text-[var(--erp-accent)] mb-4 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  );
}

function AccountCard({ account, language, money }) {
  const type = account.type || "cash";
  const icon = type === "bank" ? <Building2 /> : type === "wallet" ? <Wallet /> : <Landmark />;
  const balance = toNumber(account.balance ?? account.opening_balance);

  return (
    <div className="rounded-2xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[var(--erp-glow)] text-[var(--erp-accent)] flex items-center justify-center">
            {icon}
          </div>
          <div>
            <div className="font-black text-[var(--erp-text)]">{account.name}</div>
            <div className="text-xs text-[var(--erp-muted)] mt-1">{accountTypeLabel(type, language)}</div>
          </div>
        </div>
        <div className={`font-black ${balance >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
          {money(balance)}
        </div>
      </div>
    </div>
  );
}

function TransactionRow({ item, language, money, date }) {
  const type = item.type || "income";
  const amount = toNumber(item.amount);
  const isIncome = type === "income";
  const isExpense = type === "expense";

  return (
    <div className="rounded-2xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
          isIncome ? "bg-emerald-500/10 text-emerald-300" : isExpense ? "bg-rose-500/10 text-rose-300" : "bg-[var(--erp-glow)] text-[var(--erp-accent)]"
        }`}>
          {typeIcon(type)}
        </div>
        <div>
          <div className="font-black text-[var(--erp-text)]">{item.description || transactionTypeLabel(type, language)}</div>
          <div className="text-xs text-[var(--erp-muted)] mt-1">
            {item.account_name || "-"} • {date ? date(item.created_at) : String(item.created_at || "").slice(0, 10)}
          </div>
        </div>
      </div>

      <div className={`font-black ${isIncome ? "text-emerald-300" : isExpense ? "text-rose-300" : "text-[var(--erp-accent)]"}`}>
        {money(amount)}
      </div>
    </div>
  );
}

function AnalysisLine({ label, value, status }) {
  const color = status === "good" ? "text-emerald-300" : status === "bad" ? "text-rose-300" : "text-[var(--erp-accent)]";
  return (
    <div className="rounded-2xl bg-[var(--erp-panel-solid)] p-4 flex items-center justify-between gap-3 mb-3">
      <span className="text-[var(--erp-muted)] font-bold">{label}</span>
      <span className={`font-black ${color}`}>{value}</span>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="text-[var(--erp-accent)] font-bold text-sm">{label}</label>
      {children}
    </div>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[var(--erp-panel)] border border-[var(--erp-border)] rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-2xl font-black text-[var(--erp-accent)]">{title}</h2>
          <button onClick={onClose} className="w-10 h-10 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-text)] font-black">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Empty({ language }) {
  return (
    <div className="rounded-2xl bg-[var(--erp-panel-solid)] p-5 text-[var(--erp-muted)] text-center">
      {language === "fa"
        ? "داده‌ای وجود ندارد."
        : language === "ar"
        ? "لا توجد بيانات."
        : language === "tr"
        ? "Veri yok."
        : "No data."}
    </div>
  );
}
