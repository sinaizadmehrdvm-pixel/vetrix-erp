import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, CreditCard, FileText, ShieldCheck, Wallet } from "lucide-react";

import { API_URL } from "../services/api";

function money(value) {
  const amount = Number(value || 0);
  return `${amount.toLocaleString()} IRR`;
}

export default function CustomerPortalView() {
  const { token } = useParams();
  const [customer, setCustomer] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [ledger, setLedger] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState(null);
  const [payError, setPayError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      const headers = { Authorization: `Bearer ${token}` };
      try {
        const [meResponse, invoicesResponse, ledgerResponse] = await Promise.all([
          fetch(`${API_URL}/api/customer-portal/me`, { headers }),
          fetch(`${API_URL}/api/customer-portal/invoices`, { headers }),
          fetch(`${API_URL}/api/customer-portal/ledger`, { headers }),
        ]);
        if (!meResponse.ok) {
          throw new Error("This link is no longer valid.");
        }
        const me = await meResponse.json();
        const invoicesData = await invoicesResponse.json();
        const ledgerData = await ledgerResponse.json();
        if (!active) return;
        setCustomer(me.customer);
        setInvoices(invoicesData.items || []);
        setLedger(ledgerData);
      } catch (err) {
        if (active) setError(err.message || "This link is no longer valid.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, [token]);

  async function payInvoice(invoiceId) {
    setPayError("");
    setPayingId(invoiceId);
    try {
      const res = await fetch(`${API_URL}/api/customer-portal/pay`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: invoiceId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || "Could not start the payment.");
      window.location.assign(data.redirect_url);
    } catch (err) {
      setPayError(err.message);
      setPayingId(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--erp-bg)] flex items-center justify-center text-[var(--erp-accent)] font-bold">
        Loading...
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="min-h-screen bg-[var(--erp-bg)] flex items-center justify-center text-center px-4">
        <div className="text-rose-300">
          <AlertTriangle className="mx-auto mb-3" size={36} />
          <p className="font-bold">{error || "This link is no longer valid."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--erp-bg)] text-[var(--erp-text)] px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-[var(--erp-accent)]" size={28} />
          <h1 className="text-2xl font-black text-[var(--erp-accent)]">Vetrix ERP — Customer Portal</h1>
        </div>

        <section className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-bg-soft)] p-6">
          <h2 className="text-xl font-black mb-1">{customer.name}</h2>
          <p className="text-slate-400 text-sm">
            {[customer.phone, customer.email, customer.city].filter(Boolean).join(" • ") || "—"}
          </p>
        </section>

        <section className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-bg-soft)] p-6">
          <div className="flex items-center gap-2 text-[var(--erp-accent)] font-black mb-3">
            <Wallet size={18} /> Account balance
          </div>
          <div className="text-3xl font-black">{money(customer.balance)}</div>
        </section>

        <section className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-bg-soft)] p-6">
          <div className="flex items-center gap-2 text-[var(--erp-accent)] font-black mb-4">
            <FileText size={18} /> Invoices
          </div>
          {payError && (
            <p className="text-rose-300 text-sm mb-3">{payError}</p>
          )}
          {invoices.length === 0 ? (
            <p className="text-slate-400">No invoices yet.</p>
          ) : (
            <div className="space-y-2">
              {invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-3"
                >
                  <div>
                    <div className="font-bold">#{invoice.id} — {invoice.invoice_type}</div>
                    <div className="text-xs text-slate-400">{invoice.payment_status}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="font-black text-[var(--erp-accent)]">{money(invoice.total_amount)}</div>
                    {invoice.invoice_type === "sale" && invoice.payment_status !== "paid" && (
                      <button
                        onClick={() => payInvoice(invoice.id)}
                        disabled={payingId === invoice.id}
                        className="px-3 py-2 rounded-xl bg-emerald-400 text-slate-950 font-black text-sm flex items-center gap-1 disabled:opacity-60"
                      >
                        <CreditCard size={14} />
                        {payingId === invoice.id ? "..." : "Pay now"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {ledger && (
          <section className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-bg-soft)] p-6">
            <div className="flex items-center gap-2 text-[var(--erp-accent)] font-black mb-4">
              <Wallet size={18} /> Statement
            </div>
            {ledger.entries.length === 0 ? (
              <p className="text-slate-400">No transactions yet.</p>
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
