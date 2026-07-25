import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, FileText, ShieldCheck, Wallet } from "lucide-react";

import { API_URL } from "../services/api";
import { useLanguage } from "../localization/useLanguage";

export default function SupplierPortalView() {
  const { token } = useParams();
  const { language, dir, money } = useLanguage();
  const fa = language === "fa";
  const [supplier, setSupplier] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [ledger, setLedger] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const invalidLinkMessage = fa ? "این لینک دیگر معتبر نیست." : "This link is no longer valid.";

  useEffect(() => {
    let active = true;

    async function load() {
      const headers = { Authorization: `Bearer ${token}` };
      try {
        const [meResponse, invoicesResponse, ledgerResponse] = await Promise.all([
          fetch(`${API_URL}/api/supplier-portal/me`, { headers }),
          fetch(`${API_URL}/api/supplier-portal/invoices`, { headers }),
          fetch(`${API_URL}/api/supplier-portal/ledger`, { headers }),
        ]);
        if (!meResponse.ok) {
          throw new Error(invalidLinkMessage);
        }
        const me = await meResponse.json();
        const invoicesData = await invoicesResponse.json();
        const ledgerData = await ledgerResponse.json();
        if (!active) return;
        setSupplier(me.supplier);
        setInvoices(invoicesData.items || []);
        setLedger(ledgerData);
      } catch (err) {
        if (active) setError(err.message || invalidLinkMessage);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading) {
    return (
      <div dir={dir} className="min-h-screen bg-[var(--erp-bg)] flex items-center justify-center text-[var(--erp-accent)] font-bold">
        {fa ? "در حال بارگذاری..." : "Loading..."}
      </div>
    );
  }

  if (error || !supplier) {
    return (
      <div dir={dir} className="min-h-screen bg-[var(--erp-bg)] flex items-center justify-center text-center px-4">
        <div className="text-rose-300">
          <AlertTriangle className="mx-auto mb-3" size={36} />
          <p className="font-bold">{error || invalidLinkMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div dir={dir} className="min-h-screen bg-[var(--erp-bg)] text-[var(--erp-text)] px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-[var(--erp-accent)]" size={28} />
          <h1 className="text-2xl font-black text-[var(--erp-accent)]">{fa ? "Vetrix ERP — پرتال تأمین‌کننده" : "Vetrix ERP — Supplier Portal"}</h1>
        </div>

        <section className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-bg-soft)] p-6">
          <h2 className="text-xl font-black mb-1">{supplier.name}</h2>
          <p className="text-[var(--erp-muted)] text-sm">
            {[supplier.phone, supplier.email, supplier.city].filter(Boolean).join(" • ") || "—"}
          </p>
        </section>

        <section className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-bg-soft)] p-6">
          <div className="flex items-center gap-2 text-[var(--erp-accent)] font-black mb-3">
            <Wallet size={18} /> {fa ? "مانده حساب" : "Account balance"}
          </div>
          <div className="text-3xl font-black">{money(supplier.balance)}</div>
        </section>

        <section className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-bg-soft)] p-6">
          <div className="flex items-center gap-2 text-[var(--erp-accent)] font-black mb-4">
            <FileText size={18} /> {fa ? "فاکتورهای خرید" : "Purchase invoices"}
          </div>
          {invoices.length === 0 ? (
            <p className="text-[var(--erp-muted)]">{fa ? "هنوز فاکتوری ثبت نشده است." : "No invoices yet."}</p>
          ) : (
            <div className="space-y-2">
              {invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-3"
                >
                  <div>
                    <div className="font-bold">#{invoice.id} — {invoice.invoice_type}</div>
                    <div className="text-xs text-[var(--erp-muted)]">{invoice.payment_status}</div>
                  </div>
                  <div className="font-black text-[var(--erp-accent)]">{money(invoice.total_amount)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {ledger && (
          <section className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-bg-soft)] p-6">
            <div className="flex items-center gap-2 text-[var(--erp-accent)] font-black mb-4">
              <Wallet size={18} /> {fa ? "صورت‌حساب" : "Statement"}
            </div>
            {ledger.entries.length === 0 ? (
              <p className="text-[var(--erp-muted)]">{fa ? "هنوز تراکنشی ثبت نشده است." : "No transactions yet."}</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-auto pr-1">
                {ledger.entries.map((entry, index) => (
                  <div key={index} className="rounded-xl bg-black/20 px-4 py-3">
                    <div className="flex items-center justify-between text-sm">
                      <span>{entry.description}</span>
                      <span className="font-black">{money(entry.balance)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
