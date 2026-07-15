import { useEffect, useState } from "react";
import { useStableCallback } from "../hooks/useStableCallback";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  Download,
  FileBarChart,
  Printer,
  RefreshCw,
  Scale,
  TrendingUp,
} from "lucide-react";

import { useLanguage } from "../localization/useLanguage";
import { getFiscalPeriods } from "../services/fiscalPeriodsApi";
import { getFinancialStatements } from "../services/financialStatementsApi";

export default function FinancialStatements() {
  const { language, dir, money, date, n } = useLanguage();
  const fa = language === "fa";
  const [periods, setPeriods] = useState([]);
  const [periodId, setPeriodId] = useState("");
  const [data, setData] = useState(null);
  const [active, setActive] = useState("balance");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const copy = {
    title: fa ? "صورت‌های مالی استاندارد" : "Standard Financial Statements",
    subtitle: fa
      ? "ترازنامه، سود و زیان و گردش نقدی مستقیماً از دفتر کل قطعی"
      : "Balance sheet, income statement, and cash flow directly from the posted ledger",
    allTime: fa ? "همه دوره‌ها" : "All periods",
    balance: fa ? "ترازنامه" : "Balance Sheet",
    income: fa ? "سود و زیان" : "Income Statement",
    cash: fa ? "گردش نقدی" : "Cash Flow",
    assets: fa ? "دارایی‌ها" : "Assets",
    liabilities: fa ? "بدهی‌ها" : "Liabilities",
    equity: fa ? "حقوق صاحبان سرمایه" : "Equity",
    currentEarnings: fa ? "سود انباشته تا این دوره" : "Accumulated earnings",
    periodIncome: fa ? "سود خالص دوره" : "Period net income",
    totalAssets: fa ? "جمع دارایی‌ها" : "Total assets",
    totalLiabilities: fa ? "جمع بدهی‌ها" : "Total liabilities",
    totalEquity: fa ? "جمع حقوق صاحبان سرمایه" : "Total equity",
    rightSide: fa ? "جمع بدهی و حقوق صاحبان سرمایه" : "Liabilities & equity",
    revenue: fa ? "درآمدها" : "Revenue",
    expenses: fa ? "هزینه‌ها" : "Expenses",
    totalRevenue: fa ? "جمع درآمد" : "Total revenue",
    totalExpenses: fa ? "جمع هزینه" : "Total expenses",
    netIncome: fa ? "سود خالص" : "Net income",
    openingCash: fa ? "مانده نقد ابتدای دوره" : "Opening cash",
    inflows: fa ? "ورودی نقد" : "Cash inflows",
    outflows: fa ? "خروجی نقد" : "Cash outflows",
    netChange: fa ? "تغییر خالص نقد" : "Net change",
    endingCash: fa ? "مانده نقد پایان دوره" : "Ending cash",
    balanced: fa ? "معادله حسابداری تراز است" : "Accounting equation balanced",
    unbalanced: fa ? "اختلاف در معادله حسابداری" : "Accounting equation difference",
    posted: fa ? "اسناد قطعی مبنا" : "Posted vouchers",
    refresh: fa ? "به‌روزرسانی" : "Refresh",
    export: fa ? "خروجی CSV" : "CSV export",
    print: fa ? "چاپ" : "Print",
    account: fa ? "حساب" : "Account",
    amount: fa ? "مبلغ" : "Amount",
    noRows: fa ? "گردشی در این بخش وجود ندارد." : "No activity in this section.",
  };

  async function load(nextPeriodId = periodId) {
    setLoading(true);
    setError("");
    try {
      let available = periods;
      if (!available.length) {
        available = await getFiscalPeriods();
        setPeriods(Array.isArray(available) ? available : []);
        if (!nextPeriodId && available.length) {
          nextPeriodId = available[0].id;
          setPeriodId(String(nextPeriodId));
        }
      }
      setData(await getFinancialStatements(nextPeriodId));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  const stableLoad = useStableCallback(load);

  useEffect(() => {
    const initialTimer = setTimeout(() => { void stableLoad(""); }, 0);
    return () => clearTimeout(initialTimer);
  }, [language, stableLoad]);

  async function changePeriod(value) {
    setPeriodId(value);
    await load(value);
  }

  function downloadCsv() {
    if (!data) return;
    const rows = [["Statement", "Account code", "Account", "Amount"]];
    if (active === "balance") {
      for (const [section, items] of [
        ["Assets", data.balance_sheet.asset_items],
        ["Liabilities", data.balance_sheet.liability_items],
        ["Equity", data.balance_sheet.equity_items],
      ]) {
        items.forEach((item) =>
          rows.push([section, item.account_code, item.account_name, item.amount]),
        );
      }
      rows.push(["Equity", "", "Accumulated earnings", data.balance_sheet.accumulated_earnings]);
    } else if (active === "income") {
      data.income_statement.revenue_items.forEach((item) =>
        rows.push(["Revenue", item.account_code, item.account_name, item.amount]),
      );
      data.income_statement.expense_items.forEach((item) =>
        rows.push(["Expense", item.account_code, item.account_name, item.amount]),
      );
    } else {
      data.cash_flow.accounts.forEach((item) => {
        rows.push(["Cash", item.account_code, `${item.account_name} inflows`, item.inflows]);
        rows.push(["Cash", item.account_code, `${item.account_name} outflows`, item.outflows]);
      });
    }
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `vetrix-${active}-statement.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const card = {
    background: "linear-gradient(145deg,rgba(15,23,42,.95),rgba(15,23,42,.72))",
    border: "1px solid rgba(34,211,238,.2)",
    borderRadius: 24,
    boxShadow: "0 18px 55px rgba(2,6,23,.3)",
  };
  const button = {
    border: 0,
    borderRadius: 13,
    padding: "11px 15px",
    fontWeight: 900,
    cursor: "pointer",
  };

  return (
    <div dir={dir} style={{ color: "#f8fafc", maxWidth: 1500, margin: "0 auto" }}>
      <header className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 55, height: 55, display: "grid", placeItems: "center", borderRadius: 17, background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
            <FileBarChart size={30} />
          </div>
          <div>
            <h1 style={{ margin: 0, color: "#a5f3fc", fontSize: "clamp(28px,4vw,41px)" }}>{copy.title}</h1>
            <p style={{ margin: "7px 0 0", color: "#94a3b8" }}>{copy.subtitle}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={periodId} onChange={(event) => changePeriod(event.target.value)} style={{ background: "#1e293b", color: "white", border: "1px solid rgba(34,211,238,.25)", borderRadius: 13, padding: "10px 13px" }}>
            <option value="">{copy.allTime}</option>
            {periods.map((period) => <option key={period.id} value={period.id}>{period.name} — {period.status}</option>)}
          </select>
          <button onClick={() => load()} disabled={loading} style={{ ...button, background: "#164e63", color: "#cffafe", display: "flex", gap: 7, alignItems: "center" }}><RefreshCw size={16} />{loading ? "..." : copy.refresh}</button>
          <button onClick={downloadCsv} style={{ ...button, background: "#166534", color: "#dcfce7", display: "flex", gap: 7, alignItems: "center" }}><Download size={16} />{copy.export}</button>
          <button onClick={() => window.print()} style={{ ...button, background: "#334155", color: "#e2e8f0", display: "flex", gap: 7, alignItems: "center" }}><Printer size={16} />{copy.print}</button>
        </div>
      </header>

      {error && <div style={{ ...card, padding: 16, marginBottom: 17, color: "#fecaca" }}>{error}</div>}

      {data && (
        <>
          <section style={{ ...card, padding: 17, marginBottom: 16, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <strong style={{ color: "#67e8f9" }}>{data.period?.name || copy.allTime}</strong>
              {data.period && <div style={{ color: "#94a3b8", marginTop: 5 }}>{date(data.period.start_date)} — {date(data.period.end_date)}</div>}
            </div>
            <div style={{ color: "#94a3b8" }}>{copy.posted}: <b style={{ color: "#e2e8f0" }}>{n(data.posted_vouchers)}</b></div>
            <div style={{ color: data.valid ? "#86efac" : "#fca5a5", fontWeight: 900, display: "flex", gap: 7, alignItems: "center" }}>
              <Scale size={18} />{data.valid ? copy.balanced : copy.unbalanced}
            </div>
          </section>

          <nav className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {[
              ["balance", copy.balance, Scale],
              ["income", copy.income, TrendingUp],
              ["cash", copy.cash, Banknote],
            ].map(([id, label, Icon]) => (
              <button key={id} onClick={() => setActive(id)} style={{ ...button, display: "flex", gap: 7, alignItems: "center", background: active === id ? "#22d3ee" : "#1e293b", color: active === id ? "#05202a" : "#cbd5e1" }}>
                <Icon size={17} />{label}
              </button>
            ))}
          </nav>

          {active === "balance" && <BalanceSheet data={data.balance_sheet} copy={copy} money={money} card={card} />}
          {active === "income" && <IncomeStatement data={data.income_statement} copy={copy} money={money} card={card} />}
          {active === "cash" && <CashFlow data={data.cash_flow} copy={copy} money={money} card={card} />}
        </>
      )}
    </div>
  );
}

function StatementTable({ title, items, copy, money, color }) {
  return (
    <section style={{ padding: 16, borderRadius: 18, background: "rgba(30,41,59,.65)" }}>
      <h3 style={{ color, margin: "0 0 12px" }}>{title}</h3>
      {!items.length && <div style={{ color: "#64748b", padding: 12 }}>{copy.noRows}</div>}
      {items.map((item) => (
        <div key={item.account_id || item.account_code} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 3px", borderTop: "1px solid rgba(148,163,184,.1)" }}>
          <span><code style={{ color: "#64748b", marginInlineEnd: 8 }}>{item.account_code}</code>{item.account_name}</span>
          <strong style={{ color: item.amount < 0 ? "#fca5a5" : "#e0f2fe" }}>{money(item.amount)}</strong>
        </div>
      ))}
    </section>
  );
}

function BalanceSheet({ data, copy, money, card }) {
  return (
    <section style={{ ...card, padding: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
        <StatementTable title={copy.assets} items={data.asset_items} copy={copy} money={money} color="#67e8f9" />
        <StatementTable title={copy.liabilities} items={data.liability_items} copy={copy} money={money} color="#fda4af" />
        <div>
          <StatementTable title={copy.equity} items={data.equity_items} copy={copy} money={money} color="#c4b5fd" />
          <div style={{ marginTop: 9, padding: 12, borderRadius: 14, background: "rgba(139,92,246,.12)", display: "flex", justifyContent: "space-between" }}>
            <span>{copy.currentEarnings}</span><strong>{money(data.accumulated_earnings)}</strong>
          </div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, marginTop: 14 }}>
        <Total label={copy.totalAssets} value={data.total_assets} money={money} />
        <Total label={copy.totalLiabilities} value={data.total_liabilities} money={money} />
        <Total label={copy.totalEquity} value={data.total_equity} money={money} />
        <Total label={copy.rightSide} value={data.liabilities_and_equity} money={money} />
      </div>
      <div style={{ marginTop: 13, color: data.balanced ? "#86efac" : "#fca5a5", textAlign: "center", fontWeight: 950 }}>
        {data.balanced ? copy.balanced : `${copy.unbalanced}: ${money(data.difference)}`}
      </div>
    </section>
  );
}

function IncomeStatement({ data, copy, money, card }) {
  return (
    <section style={{ ...card, padding: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
        <StatementTable title={copy.revenue} items={data.revenue_items} copy={copy} money={money} color="#86efac" />
        <StatementTable title={copy.expenses} items={data.expense_items} copy={copy} money={money} color="#fda4af" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, marginTop: 14 }}>
        <Total label={copy.totalRevenue} value={data.total_revenue} money={money} />
        <Total label={copy.totalExpenses} value={data.total_expenses} money={money} />
        <Total label={copy.netIncome} value={data.net_income} money={money} highlight />
      </div>
    </section>
  );
}

function CashFlow({ data, copy, money, card }) {
  const metrics = [
    [copy.openingCash, data.opening_balance, Banknote],
    [copy.inflows, data.inflows, ArrowDownToLine],
    [copy.outflows, data.outflows, ArrowUpFromLine],
    [copy.netChange, data.net_change, TrendingUp],
    [copy.endingCash, data.ending_balance, Banknote],
  ];
  return (
    <section style={{ ...card, padding: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
        {metrics.map(([label, value, Icon]) => (
          <div key={label} style={{ padding: 15, borderRadius: 17, background: "rgba(30,41,59,.68)" }}>
            <Icon size={19} color="#67e8f9" />
            <div style={{ color: "#94a3b8", marginTop: 9, fontSize: 12 }}>{label}</div>
            <strong style={{ display: "block", marginTop: 5, color: value < 0 ? "#fca5a5" : "#e0f2fe", fontSize: 19 }}>{money(value)}</strong>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 15 }}>
        <StatementTable title={faLabel(copy.cash)} items={data.accounts.map((item) => ({ ...item, account_id: item.account_code, amount: item.net_change }))} copy={copy} money={money} color="#67e8f9" />
      </div>
    </section>
  );
}

function faLabel(value) {
  return value;
}

function Total({ label, value, money, highlight }) {
  return (
    <div style={{ padding: 15, borderRadius: 17, background: highlight ? "linear-gradient(135deg,rgba(34,211,238,.18),rgba(34,197,94,.14))" : "rgba(30,41,59,.68)" }}>
      <div style={{ color: "#94a3b8", fontSize: 12 }}>{label}</div>
      <strong style={{ display: "block", marginTop: 6, color: value < 0 ? "#fca5a5" : "#e0f2fe", fontSize: 20 }}>{money(value)}</strong>
    </div>
  );
}
