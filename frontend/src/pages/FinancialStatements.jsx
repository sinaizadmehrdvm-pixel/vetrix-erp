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
import { toPersianDigits } from "../localization/helpers";
import { getFiscalPeriods } from "../services/fiscalPeriodsApi";
import { getFinancialStatements } from "../services/financialStatementsApi";

export default function FinancialStatements() {
  const { language, dir, money, date, n } = useLanguage();
  const [periods, setPeriods] = useState([]);
  const [periodId, setPeriodId] = useState("");
  const [data, setData] = useState(null);
  const [active, setActive] = useState("balance");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const copy = {
    title: language === "fa" ? "صورت‌های مالی استاندارد" : language === "ar" ? "القوائم المالية القياسية" : language === "tr" ? "Standart Mali Tablolar" : "Standard Financial Statements",
    subtitle: language === "fa"
      ? "ترازنامه، سود و زیان و گردش نقدی مستقیماً از دفتر کل قطعی"
      : language === "ar"
      ? "الميزانية العمومية وقائمة الدخل والتدفق النقدي مباشرة من دفتر الأستاذ المرحّل"
      : language === "tr"
      ? "Bilanço, gelir tablosu ve nakit akışı doğrudan kesinleşmiş büyük defterden"
      : "Balance sheet, income statement, and cash flow directly from the posted ledger",
    allTime: language === "fa" ? "همه دوره‌ها" : language === "ar" ? "جميع الفترات" : language === "tr" ? "Tüm Dönemler" : "All periods",
    balance: language === "fa" ? "ترازنامه" : language === "ar" ? "الميزانية العمومية" : language === "tr" ? "Bilanço" : "Balance Sheet",
    income: language === "fa" ? "سود و زیان" : language === "ar" ? "قائمة الدخل" : language === "tr" ? "Gelir Tablosu" : "Income Statement",
    cash: language === "fa" ? "گردش نقدی" : language === "ar" ? "التدفق النقدي" : language === "tr" ? "Nakit Akışı" : "Cash Flow",
    assets: language === "fa" ? "دارایی‌ها" : language === "ar" ? "الأصول" : language === "tr" ? "Varlıklar" : "Assets",
    liabilities: language === "fa" ? "بدهی‌ها" : language === "ar" ? "الخصوم" : language === "tr" ? "Borçlar" : "Liabilities",
    equity: language === "fa" ? "حقوق صاحبان سرمایه" : language === "ar" ? "حقوق الملكية" : language === "tr" ? "Özkaynaklar" : "Equity",
    currentEarnings: language === "fa" ? "سود انباشته تا این دوره" : language === "ar" ? "الأرباح المتراكمة" : language === "tr" ? "Birikmiş Kârlar" : "Accumulated earnings",
    periodIncome: language === "fa" ? "سود خالص دوره" : language === "ar" ? "صافي دخل الفترة" : language === "tr" ? "Dönem Net Geliri" : "Period net income",
    totalAssets: language === "fa" ? "جمع دارایی‌ها" : language === "ar" ? "إجمالي الأصول" : language === "tr" ? "Toplam Varlıklar" : "Total assets",
    totalLiabilities: language === "fa" ? "جمع بدهی‌ها" : language === "ar" ? "إجمالي الخصوم" : language === "tr" ? "Toplam Borçlar" : "Total liabilities",
    totalEquity: language === "fa" ? "جمع حقوق صاحبان سرمایه" : language === "ar" ? "إجمالي حقوق الملكية" : language === "tr" ? "Toplam Özkaynaklar" : "Total equity",
    rightSide: language === "fa" ? "جمع بدهی و حقوق صاحبان سرمایه" : language === "ar" ? "إجمالي الخصوم وحقوق الملكية" : language === "tr" ? "Borçlar ve Özkaynaklar" : "Liabilities & equity",
    revenue: language === "fa" ? "درآمدها" : language === "ar" ? "الإيرادات" : language === "tr" ? "Gelirler" : "Revenue",
    expenses: language === "fa" ? "هزینه‌ها" : language === "ar" ? "المصروفات" : language === "tr" ? "Giderler" : "Expenses",
    totalRevenue: language === "fa" ? "جمع درآمد" : language === "ar" ? "إجمالي الإيرادات" : language === "tr" ? "Toplam Gelir" : "Total revenue",
    totalExpenses: language === "fa" ? "جمع هزینه" : language === "ar" ? "إجمالي المصروفات" : language === "tr" ? "Toplam Gider" : "Total expenses",
    netIncome: language === "fa" ? "سود خالص" : language === "ar" ? "صافي الدخل" : language === "tr" ? "Net Gelir" : "Net income",
    openingCash: language === "fa" ? "مانده نقد ابتدای دوره" : language === "ar" ? "الرصيد النقدي الافتتاحي" : language === "tr" ? "Açılış Nakit Bakiyesi" : "Opening cash",
    inflows: language === "fa" ? "ورودی نقد" : language === "ar" ? "التدفقات النقدية الداخلة" : language === "tr" ? "Nakit Girişleri" : "Cash inflows",
    outflows: language === "fa" ? "خروجی نقد" : language === "ar" ? "التدفقات النقدية الخارجة" : language === "tr" ? "Nakit Çıkışları" : "Cash outflows",
    netChange: language === "fa" ? "تغییر خالص نقد" : language === "ar" ? "صافي التغير" : language === "tr" ? "Net Değişim" : "Net change",
    endingCash: language === "fa" ? "مانده نقد پایان دوره" : language === "ar" ? "الرصيد النقدي الختامي" : language === "tr" ? "Kapanış Nakit Bakiyesi" : "Ending cash",
    balanced: language === "fa" ? "معادله حسابداری تراز است" : language === "ar" ? "المعادلة المحاسبية متوازنة" : language === "tr" ? "Muhasebe Denklemi Dengeli" : "Accounting equation balanced",
    unbalanced: language === "fa" ? "اختلاف در معادله حسابداری" : language === "ar" ? "فرق في المعادلة المحاسبية" : language === "tr" ? "Muhasebe Denkleminde Fark" : "Accounting equation difference",
    posted: language === "fa" ? "اسناد قطعی مبنا" : language === "ar" ? "المستندات المرحّلة الأساس" : language === "tr" ? "Kesinleşmiş Fişler" : "Posted vouchers",
    refresh: language === "fa" ? "به‌روزرسانی" : language === "ar" ? "تحديث" : language === "tr" ? "Yenile" : "Refresh",
    export: language === "fa" ? "خروجی CSV" : language === "ar" ? "تصدير CSV" : language === "tr" ? "CSV Dışa Aktar" : "CSV export",
    print: language === "fa" ? "چاپ" : language === "ar" ? "طباعة" : language === "tr" ? "Yazdır" : "Print",
    account: language === "fa" ? "حساب" : language === "ar" ? "الحساب" : language === "tr" ? "Hesap" : "Account",
    amount: language === "fa" ? "مبلغ" : language === "ar" ? "المبلغ" : language === "tr" ? "Tutar" : "Amount",
    noRows: language === "fa" ? "گردشی در این بخش وجود ندارد." : language === "ar" ? "لا يوجد نشاط في هذا القسم." : language === "tr" ? "Bu bölümde hareket yok." : "No activity in this section.",
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
    background: "var(--erp-panel)",
    border: "1px solid var(--erp-border)",
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
    <div dir={dir} style={{ color: "var(--erp-text)", maxWidth: 1500, margin: "0 auto" }}>
      <header className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 55, height: 55, display: "grid", placeItems: "center", borderRadius: 17, background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
            <FileBarChart size={30} />
          </div>
          <div>
            <h1 style={{ margin: 0, color: "var(--erp-accent)", fontSize: "clamp(28px,4vw,41px)" }}>{copy.title}</h1>
            <p style={{ margin: "7px 0 0", color: "var(--erp-muted)" }}>{copy.subtitle}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={periodId} onChange={(event) => changePeriod(event.target.value)} style={{ background: "var(--erp-panel-solid)", color: "var(--erp-text)", border: "1px solid var(--erp-border)", borderRadius: 13, padding: "10px 13px" }}>
            <option value="">{copy.allTime}</option>
            {periods.map((period) => <option key={period.id} value={period.id}>{period.name} — {period.status}</option>)}
          </select>
          <button onClick={() => load()} disabled={loading} style={{ ...button, background: "var(--erp-panel-solid)", color: "var(--erp-accent)", display: "flex", gap: 7, alignItems: "center" }}><RefreshCw size={16} />{loading ? "..." : copy.refresh}</button>
          <button onClick={downloadCsv} style={{ ...button, background: "#166534", color: "#dcfce7", display: "flex", gap: 7, alignItems: "center" }}><Download size={16} />{copy.export}</button>
          <button onClick={() => window.print()} style={{ ...button, background: "var(--erp-panel-solid)", color: "var(--erp-text)", display: "flex", gap: 7, alignItems: "center" }}><Printer size={16} />{copy.print}</button>
        </div>
      </header>

      {error && <div className="text-red-200" style={{ ...card, padding: 16, marginBottom: 17 }}>{error}</div>}

      {data && (
        <>
          <section style={{ ...card, padding: 17, marginBottom: 16, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <strong style={{ color: "var(--erp-accent)" }}>{data.period?.name || copy.allTime}</strong>
              {data.period && <div style={{ color: "var(--erp-muted)", marginTop: 5 }}>{date(data.period.start_date)} — {date(data.period.end_date)}</div>}
            </div>
            <div style={{ color: "var(--erp-muted)" }}>{copy.posted}: <b style={{ color: "var(--erp-text)" }}>{n(data.posted_vouchers)}</b></div>
            <div className={data.valid ? "text-green-300" : "text-red-300"} style={{ fontWeight: 900, display: "flex", gap: 7, alignItems: "center" }}>
              <Scale size={18} />{data.valid ? copy.balanced : copy.unbalanced}
            </div>
          </section>

          <nav className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {[
              ["balance", copy.balance, Scale],
              ["income", copy.income, TrendingUp],
              ["cash", copy.cash, Banknote],
            ].map(([id, label, Icon]) => (
              <button key={id} onClick={() => setActive(id)} style={{ ...button, display: "flex", gap: 7, alignItems: "center", background: active === id ? "var(--erp-accent)" : "var(--erp-panel-solid)", color: active === id ? "#05202a" : "var(--erp-muted)" }}>
                <Icon size={17} />{label}
              </button>
            ))}
          </nav>

          {active === "balance" && <BalanceSheet data={data.balance_sheet} copy={copy} money={money} language={language} card={card} />}
          {active === "income" && <IncomeStatement data={data.income_statement} copy={copy} money={money} language={language} card={card} />}
          {active === "cash" && <CashFlow data={data.cash_flow} copy={copy} money={money} language={language} card={card} />}
        </>
      )}
    </div>
  );
}

function StatementTable({ title, items, copy, money, language, color, colorClassName }) {
  return (
    <section style={{ padding: 16, borderRadius: 18, background: "var(--erp-panel-solid)" }}>
      <h3 className={colorClassName} style={colorClassName ? { margin: "0 0 12px" } : { color, margin: "0 0 12px" }}>{title}</h3>
      {!items.length && <div style={{ color: "var(--erp-muted)", padding: 12 }}>{copy.noRows}</div>}
      {items.map((item) => (
        <div key={item.account_id || item.account_code} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 3px", borderTop: "1px solid var(--erp-border)" }}>
          <span><code style={{ color: "var(--erp-muted)", marginInlineEnd: 8 }}>{language === "fa" ? toPersianDigits(item.account_code) : item.account_code}</code>{item.account_name}</span>
          <strong className={item.amount < 0 ? "text-red-300" : undefined} style={item.amount < 0 ? undefined : { color: "var(--erp-text)" }}>{money(item.amount)}</strong>
        </div>
      ))}
    </section>
  );
}

function BalanceSheet({ data, copy, money, language, card }) {
  return (
    <section style={{ ...card, padding: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
        <StatementTable title={copy.assets} items={data.asset_items} copy={copy} money={money} language={language} color="var(--erp-accent)" />
        <StatementTable title={copy.liabilities} items={data.liability_items} copy={copy} money={money} language={language} color="#fda4af" />
        <div>
          <StatementTable title={copy.equity} items={data.equity_items} copy={copy} money={money} language={language} colorClassName="text-violet-300" />
          <div style={{ marginTop: 9, padding: 12, borderRadius: 14, background: "var(--erp-glow)", display: "flex", justifyContent: "space-between" }}>
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
      <div className={data.balanced ? "text-green-300" : "text-red-300"} style={{ marginTop: 13, textAlign: "center", fontWeight: 950 }}>
        {data.balanced ? copy.balanced : `${copy.unbalanced}: ${money(data.difference)}`}
      </div>
    </section>
  );
}

function IncomeStatement({ data, copy, money, language, card }) {
  return (
    <section style={{ ...card, padding: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
        <StatementTable title={copy.revenue} items={data.revenue_items} copy={copy} money={money} language={language} colorClassName="text-green-300" />
        <StatementTable title={copy.expenses} items={data.expense_items} copy={copy} money={money} language={language} color="#fda4af" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, marginTop: 14 }}>
        <Total label={copy.totalRevenue} value={data.total_revenue} money={money} />
        <Total label={copy.totalExpenses} value={data.total_expenses} money={money} />
        <Total label={copy.netIncome} value={data.net_income} money={money} highlight />
      </div>
    </section>
  );
}

function CashFlow({ data, copy, money, language, card }) {
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
          <div key={label} style={{ padding: 15, borderRadius: 17, background: "var(--erp-panel-solid)" }}>
            <Icon size={19} color="var(--erp-accent)" />
            <div style={{ color: "var(--erp-muted)", marginTop: 9, fontSize: 12 }}>{label}</div>
            <strong className={value < 0 ? "text-red-300" : undefined} style={{ display: "block", marginTop: 5, ...(value < 0 ? null : { color: "var(--erp-text)" }), fontSize: 19 }}>{money(value)}</strong>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 15 }}>
        <StatementTable title={faLabel(copy.cash)} items={data.accounts.map((item) => ({ ...item, account_id: item.account_code, amount: item.net_change }))} copy={copy} money={money} language={language} color="var(--erp-accent)" />
      </div>
    </section>
  );
}

function faLabel(value) {
  return value;
}

function Total({ label, value, money, highlight }) {
  return (
    <div style={{ padding: 15, borderRadius: 17, background: highlight ? "linear-gradient(135deg,var(--erp-glow),rgba(34,197,94,.14))" : "var(--erp-panel-solid)" }}>
      <div style={{ color: "var(--erp-muted)", fontSize: 12 }}>{label}</div>
      <strong className={value < 0 ? "text-red-300" : undefined} style={{ display: "block", marginTop: 6, ...(value < 0 ? null : { color: "var(--erp-text)" }), fontSize: 20 }}>{money(value)}</strong>
    </div>
  );
}
