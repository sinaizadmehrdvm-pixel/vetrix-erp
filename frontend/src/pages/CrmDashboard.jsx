import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Crown,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Star,
  TrendingUp,
  UserRoundCheck,
  Users,
  Wallet,
  PhoneCall,
  CalendarClock,
  Receipt,
  CreditCard,
  Eye,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useLanguage } from "../localization/useLanguage";
import { API_URL, getAuthHeaders, getCustomers } from "../services/api";

function toNumber(value) {
  return Number(
    String(value ?? "")
      .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
      .replace(/[,،]/g, "")
      .replace(/[^\d.-]/g, "") || 0
  );
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getBalance(item) {
  const balance = toNumber(item?.balance);
  if (balance !== 0) return balance;
  const debit = toNumber(item?.debit ?? item?.debtor);
  const credit = toNumber(item?.credit ?? item?.creditor);
  return debit - credit;
}

function customerScore(item) {
  const balance = getBalance(item);
  const debt = Math.max(balance, 0);
  const creditLimit = toNumber(item.credit_limit);
  const opening = Math.abs(toNumber(item.opening_balance));
  const invoiceCount = toNumber(item.invoice_count);
  const sales = toNumber(item.sales_amount ?? item.total_sales);
  let score = 55;

  if (sales > 0) score += Math.min(20, sales / 10000000);
  if (invoiceCount > 0) score += Math.min(10, invoiceCount * 2);
  if (opening > 0) score += 5;
  if (item.phone || item.mobile) score += 6;
  if (item.email) score += 3;
  if (item.address || item.city) score += 4;
  if (creditLimit > 0) score += 4;
  if (debt > 0) score -= 8;
  if (creditLimit > 0 && debt > creditLimit) score -= 25;
  if (creditLimit === 0 && debt > 0) score -= 8;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreLevel(score, fa) {
  if (score >= 85) return { key: "vip", label: "VIP", color: "text-yellow-300", bg: "bg-yellow-400/10", border: "border-yellow-400/20" };
  if (score >= 70) return { key: "gold", label: fa ? "طلایی" : "Gold", color: "text-emerald-300", bg: "bg-emerald-400/10", border: "border-emerald-400/20" };
  if (score >= 50) return { key: "normal", label: fa ? "معمولی" : "Normal", color: "text-cyan-300", bg: "bg-cyan-400/10", border: "border-cyan-400/20" };
  return { key: "risk", label: fa ? "پرریسک" : "At risk", color: "text-rose-300", bg: "bg-rose-400/10", border: "border-rose-400/20" };
}

function riskStatus(item, fa) {
  const balance = getBalance(item);
  const debt = Math.max(balance, 0);
  const creditLimit = toNumber(item.credit_limit);

  if (creditLimit > 0 && debt > creditLimit) {
    return {
      level: "critical",
      label: fa ? "عبور از سقف اعتبار" : "Over credit limit",
      text: fa ? "تماس فوری برای تسویه یا بازبینی اعتبار" : "Urgent settlement or credit review",
      color: "text-rose-300",
      bg: "bg-rose-500/10",
      border: "border-rose-400/20",
      icon: <ShieldAlert size={17} />,
    };
  }

  if (debt > 0) {
    return {
      level: "warning",
      label: fa ? "نیازمند پیگیری" : "Needs follow-up",
      text: fa ? "پیگیری دریافت مطالبات" : "Follow up receivables",
      color: "text-amber-300",
      bg: "bg-amber-500/10",
      border: "border-amber-400/20",
      icon: <PhoneCall size={17} />,
    };
  }

  if (balance < 0) {
    return {
      level: "creditor",
      label: fa ? "بستانکار" : "Creditor",
      text: fa ? "حساب بستانکار است" : "Customer has credit balance",
      color: "text-emerald-300",
      bg: "bg-emerald-500/10",
      border: "border-emerald-400/20",
      icon: <Wallet size={17} />,
    };
  }

  return {
    level: "healthy",
    label: fa ? "سالم" : "Healthy",
    text: fa ? "ارتباط را حفظ کن و تعامل بعدی را ثبت کن" : "Keep engagement active",
    color: "text-cyan-300",
    bg: "bg-cyan-500/10",
    border: "border-cyan-400/20",
    icon: <UserRoundCheck size={17} />,
  };
}

function normalizeCustomer(item) {
  return {
    ...item,
    name: item.name || "-",
    phone: item.phone || item.mobile || "",
    balance: getBalance(item),
    credit_limit: toNumber(item.credit_limit),
    invoice_count: toNumber(item.invoice_count),
    sales_amount: toNumber(item.sales_amount ?? item.total_sales),
  };
}

export default function CrmDashboard() {
  const { language, dir, n, money } = useLanguage();
  const fa = language === "fa";

  const [customers, setCustomers] = useState([]);
  const [insights, setInsights] = useState({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");

    try {
      const list = await getCustomers();
      const normalized = safeArray(list).map(normalizeCustomer);
      setCustomers(normalized);

      const insightMap = {};
      await Promise.all(
        normalized.slice(0, 30).map(async (c) => {
          try {
            const res = await fetch(`${API_URL}/api/crm/customer-insight/${c.id}`, { headers: getAuthHeaders() });
            const data = await res.json();
            insightMap[c.id] = data;
          } catch {
            insightMap[c.id] = null;
          }
        })
      );
      setInsights(insightMap);
    } catch (error) {
      console.error("CRM loading error:", error);
      setMessage(fa ? "خطا در دریافت اطلاعات CRM" : "CRM loading error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialTimer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(initialTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const enriched = useMemo(() => {
    return customers.map((item) => {
      const apiInsight = insights[item.id];
      const score = toNumber(apiInsight?.score) || customerScore(item);
      const level = scoreLevel(score, fa);
      const risk = riskStatus(item, fa);

      return {
        ...item,
        score,
        level,
        risk,
        insight: apiInsight?.message || risk.text,
      };
    });
  }, [customers, insights, fa]);

  const summary = useMemo(() => {
    return enriched.reduce(
      (acc, item) => {
        acc.total += 1;
        acc.debt += Math.max(getBalance(item), 0);
        acc.credit += Math.max(-getBalance(item), 0);
        acc.scoreSum += item.score;
        if (item.level.key === "vip") acc.vip += 1;
        if (item.risk.level === "critical") acc.critical += 1;
        if (["critical", "warning"].includes(item.risk.level)) acc.followup += 1;
        return acc;
      },
      { total: 0, debt: 0, credit: 0, scoreSum: 0, vip: 0, critical: 0, followup: 0 }
    );
  }, [enriched]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return enriched
      .filter((item) => {
        const text = [
          item.name,
          item.phone,
          item.email,
          item.city,
          item.address,
          item.level.label,
          item.risk.label,
          item.insight,
        ]
          .join(" ")
          .toLowerCase();

        const matchesText = !q || text.includes(q);
        const matchesFilter =
          filter === "all" ||
          (filter === "vip" && item.level.key === "vip") ||
          (filter === "risk" && item.risk.level === "critical") ||
          (filter === "followup" && ["critical", "warning"].includes(item.risk.level)) ||
          (filter === "healthy" && item.risk.level === "healthy");

        return matchesText && matchesFilter;
      })
      .sort((a, b) => {
        if (filter === "risk" || filter === "followup") return Math.max(getBalance(b), 0) - Math.max(getBalance(a), 0);
        return b.score - a.score;
      });
  }, [enriched, query, filter]);

  const avgScore = summary.total ? Math.round(summary.scoreSum / summary.total) : 0;
  const topCustomers = enriched.slice().sort((a, b) => b.score - a.score).slice(0, 5);
  const riskCustomers = enriched.filter((x) => ["critical", "warning"].includes(x.risk.level)).slice(0, 5);

  return (
    <div
      dir={dir}
      className="min-h-screen p-7 space-y-6"
      style={{
        direction: dir,
        background:
          "radial-gradient(circle at top left, var(--erp-glow), transparent 35%), radial-gradient(circle at top right, rgba(168,85,247,0.14), transparent 35%), var(--erp-bg)",
      }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-black text-[var(--erp-accent)]">
            {fa ? "مرکز CRM هوشمند" : "Smart CRM Center"}
          </h1>
          <p className="text-[var(--erp-muted)] mt-2">
            {fa
              ? "تحلیل مشتریان، امتیاز وفاداری، ریسک اعتباری، پیگیری مطالبات و پیشنهاد اقدام بعدی"
              : "Customer analytics, loyalty score, credit risk, follow-up and next-best-action"}
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="px-5 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] border border-[var(--erp-border)] font-black flex items-center gap-2 disabled:opacity-60"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          {fa ? "به‌روزرسانی" : "Refresh"}
        </button>
      </div>

      {message && (
        <div className="rounded-2xl p-4 bg-rose-500/10 border border-rose-400/20 text-rose-200 flex items-center gap-2">
          <AlertTriangle size={18} />
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5">
        <CrmStat icon={<Users />} title={fa ? "کل مشتریان" : "Customers"} value={n(summary.total)} color="text-[var(--erp-accent)]" />
        <CrmStat icon={<Crown />} title={fa ? "VIP" : "VIP"} value={n(summary.vip)} color="text-yellow-300" />
        <CrmStat icon={<PhoneCall />} title={fa ? "نیازمند پیگیری" : "Follow-up"} value={n(summary.followup)} color="text-amber-300" />
        <CrmStat icon={<ShieldAlert />} title={fa ? "ریسک اعتباری" : "Credit risk"} value={n(summary.critical)} color="text-rose-300" />
        <CrmStat icon={<Activity />} title={fa ? "میانگین امتیاز" : "Avg score"} value={`${n(avgScore)}/100`} color="text-emerald-300" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_.9fr] gap-5">
        <CrmHero fa={fa} n={n} money={money} avgScore={avgScore} debt={summary.debt} credit={summary.credit} followup={summary.followup} />
        <NextBestActions fa={fa} money={money} items={riskCustomers} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[.8fr_1.2fr] gap-5">
        <TopCustomers fa={fa} n={n} money={money} items={topCustomers} />
        <CustomerList
          fa={fa}
          n={n}
          money={money}
          items={filtered}
          query={query}
          setQuery={setQuery}
          filter={filter}
          setFilter={setFilter}
        />
      </div>
    </div>
  );
}

function CrmStat({ icon, title, value, color }) {
  return (
    <div className="rounded-3xl bg-[var(--erp-panel)] border border-[var(--erp-border)] p-5 shadow-2xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[var(--erp-muted)] text-sm font-bold">{title}</div>
          <div className={`text-3xl font-black mt-3 ${color}`}>{value}</div>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-[var(--erp-glow)] text-[var(--erp-accent)] flex items-center justify-center">
          {icon}
        </div>
      </div>
    </div>
  );
}

function CrmHero({ fa, n, money, avgScore, debt, credit, followup }) {
  const scoreColor = avgScore >= 75 ? "text-emerald-300" : avgScore >= 50 ? "text-amber-300" : "text-rose-300";

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-[var(--erp-border)] bg-[var(--erp-panel)] p-6 shadow-2xl">
      <div className="absolute -top-24 -left-24 w-72 h-72 bg-[var(--erp-glow)] rounded-full blur-3xl" />
      <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-purple-400/10 rounded-full blur-3xl" />

      <div className="relative">
        <div className="flex items-center gap-2 text-[var(--erp-accent)] font-black text-xl mb-4">
          <Sparkles />
          {fa ? "تحلیل کلی ارتباط با مشتری" : "Customer relationship intelligence"}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-5 items-center">
          <div>
            <div className={`text-7xl font-black ${scoreColor}`}>{n(avgScore)}</div>
            <div className="text-[var(--erp-muted)] mt-2">{fa ? "امتیاز میانگین CRM" : "Average CRM score"}</div>
            <div className="h-3 bg-[var(--erp-panel-solid)] rounded-full overflow-hidden mt-4">
              <div className="h-full bg-gradient-to-r from-rose-400 via-amber-300 to-emerald-400" style={{ width: `${avgScore}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <MiniBox title={fa ? "مطالبات" : "Receivables"} value={money(debt)} icon={<Wallet size={18} />} color="text-rose-300" />
            <MiniBox title={fa ? "بستانکاری" : "Credit"} value={money(credit)} icon={<CreditCard size={18} />} color="text-emerald-300" />
            <MiniBox title={fa ? "پیگیری فعال" : "Active follow-up"} value={n(followup)} icon={<PhoneCall size={18} />} color="text-amber-300" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniBox({ title, value, icon, color }) {
  return (
    <div className="rounded-2xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-4">
      <div className={`mb-2 ${color}`}>{icon}</div>
      <div className="text-[var(--erp-muted)] text-xs font-bold">{title}</div>
      <div className={`font-black text-lg mt-2 ${color}`}>{value}</div>
    </div>
  );
}

function NextBestActions({ fa, money, items }) {
  return (
    <div className="rounded-[2rem] border border-[var(--erp-border)] bg-[var(--erp-panel)] p-5 shadow-2xl">
      <h2 className="text-[var(--erp-accent)] font-black text-xl mb-4 flex items-center gap-2">
        <Star />
        {fa ? "اقدام پیشنهادی بعدی" : "Next-best-actions"}
      </h2>

      <div className="space-y-3">
        {items.length === 0 && (
          <div className="rounded-2xl bg-emerald-500/10 border border-emerald-400/20 p-4 text-emerald-200">
            {fa ? "مشتری پرریسک مهمی دیده نشد." : "No important at-risk customer detected."}
          </div>
        )}

        {items.map((item) => (
          <div key={item.id} className={`rounded-2xl p-4 border ${item.risk.bg} ${item.risk.border}`}>
            <div className="flex items-start gap-3">
              <div className={item.risk.color}>{item.risk.icon}</div>
              <div className="flex-1">
                <div className="text-[var(--erp-text)] font-black">{item.name}</div>
                <div className="text-[var(--erp-muted)] text-sm mt-1">{item.risk.text}</div>
                <div className="text-xs text-[var(--erp-muted)] mt-2">
                  {fa ? "مانده: " : "Balance: "}
                  <b className={item.risk.color}>{money(Math.abs(getBalance(item)))}</b>
                </div>
              </div>
              <Link to={`/customers/${item.id}`} className="px-3 py-2 rounded-xl bg-cyan-400 text-slate-950 font-black text-xs">
                {fa ? "پرونده" : "Profile"}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopCustomers({ fa, n, money, items }) {
  return (
    <div className="rounded-[2rem] border border-[var(--erp-border)] bg-[var(--erp-panel)] p-5 shadow-2xl">
      <h2 className="text-[var(--erp-accent)] font-black text-xl mb-4 flex items-center gap-2">
        <TrendingUp />
        {fa ? "ارزشمندترین مشتریان" : "Top customer value"}
      </h2>

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-2xl bg-[var(--erp-panel-solid)] p-4 border border-[var(--erp-border)]">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <div className="font-black text-[var(--erp-text)]">{item.name}</div>
                <div className="text-xs text-[var(--erp-muted)]">{item.phone || (fa ? "بدون شماره" : "No phone")}</div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-black ${item.level.bg} ${item.level.color} ${item.level.border}`}>
                {item.level.label}
              </span>
            </div>
            <div className="h-2 bg-[var(--erp-bg-soft)] rounded-full overflow-hidden mb-2">
              <div className="h-full bg-cyan-400" style={{ width: `${item.score}%` }} />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[var(--erp-muted)]">{fa ? "امتیاز" : "Score"}: {n(item.score)}</span>
              <span className="text-[var(--erp-muted)] font-bold">{money(Math.abs(getBalance(item)))}</span>
            </div>
          </div>
        ))}

        {items.length === 0 && <div className="text-[var(--erp-muted)]">{fa ? "داده‌ای وجود ندارد." : "No data."}</div>}
      </div>
    </div>
  );
}

function CustomerList({ fa, n, money, items, query, setQuery, filter, setFilter }) {
  return (
    <div className="rounded-[2rem] border border-[var(--erp-border)] bg-[var(--erp-panel)] p-5 shadow-2xl">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <h2 className="text-[var(--erp-accent)] font-black text-xl flex items-center gap-2">
          <Users />
          {fa ? "لیست تحلیلی مشتریان" : "Customer analytics list"}
        </h2>

        <div className="flex gap-2 flex-wrap">
          <div className="bg-[var(--erp-panel-solid)] rounded-2xl px-3 py-2 flex items-center gap-2">
            <Search size={16} className="text-[var(--erp-accent)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={fa ? "جستجو..." : "Search..."}
              className="bg-transparent outline-none text-[var(--erp-text)] placeholder-[var(--erp-muted)] w-44"
            />
          </div>

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-[var(--erp-panel-solid)] text-[var(--erp-text)] rounded-2xl px-3 py-2 outline-none"
          >
            <option value="all">{fa ? "همه" : "All"}</option>
            <option value="vip">VIP</option>
            <option value="followup">{fa ? "پیگیری" : "Follow-up"}</option>
            <option value="risk">{fa ? "ریسک" : "Risk"}</option>
            <option value="healthy">{fa ? "سالم" : "Healthy"}</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="text-[var(--erp-accent)] border-b border-[var(--erp-border)]">
              <th className="p-3 text-right">{fa ? "مشتری" : "Customer"}</th>
              <th className="p-3 text-right">{fa ? "امتیاز" : "Score"}</th>
              <th className="p-3 text-right">{fa ? "وضعیت" : "Status"}</th>
              <th className="p-3 text-right">{fa ? "مانده" : "Balance"}</th>
              <th className="p-3 text-right">{fa ? "اقدام بعدی" : "Next action"}</th>
              <th className="p-3 text-right">{fa ? "عملیات" : "Actions"}</th>
            </tr>
          </thead>

          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-[var(--erp-border)] hover:bg-[var(--erp-glow)]">
                <td className="p-3">
                  <div className="font-black text-[var(--erp-text)]">{item.name}</div>
                  <div className="text-xs text-[var(--erp-muted)] flex items-center gap-1 mt-1">
                    <PhoneCall size={12} />
                    {item.phone || "-"}
                  </div>
                </td>

                <td className="p-3 min-w-[150px]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-black ${item.level.bg} ${item.level.color}`}>
                      {item.level.label}
                    </span>
                    <span className="text-[var(--erp-muted)] text-xs">{n(item.score)}/100</span>
                  </div>
                  <div className="h-2 bg-[var(--erp-panel-solid)] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-rose-400 via-amber-300 to-emerald-400" style={{ width: `${item.score}%` }} />
                  </div>
                </td>

                <td className="p-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-black ${item.risk.bg} ${item.risk.color}`}>
                    {item.risk.label}
                  </span>
                </td>

                <td className={`p-3 font-black ${getBalance(item) > 0 ? "text-rose-300" : getBalance(item) < 0 ? "text-emerald-300" : "text-[var(--erp-accent)]"}`}>
                  {money(Math.abs(getBalance(item)))}
                </td>

                <td className="p-3 text-[var(--erp-muted)]">
                  <div className="flex items-center gap-1 text-xs">
                    <CalendarClock size={13} className="text-[var(--erp-accent)]" />
                    {item.risk.text}
                  </div>
                </td>

                <td className="p-3">
                  <div className="flex gap-2">
                    <Link to={`/customers/${item.id}`} className="px-3 py-2 rounded-xl bg-[var(--erp-glow)] text-[var(--erp-accent)] font-bold flex items-center gap-1">
                      <Eye size={15} />
                      {fa ? "پرونده" : "Profile"}
                    </Link>
                    <Link to="/invoices" className="px-3 py-2 rounded-xl bg-[var(--erp-panel-solid)] text-[var(--erp-text)] font-bold flex items-center gap-1">
                      <Receipt size={15} />
                      {fa ? "فاکتور" : "Invoice"}
                    </Link>
                  </div>
                </td>
              </tr>
            ))}

            {items.length === 0 && (
              <tr>
                <td colSpan="6" className="p-8 text-center text-[var(--erp-muted)]">
                  {fa ? "موردی یافت نشد." : "No customer found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
