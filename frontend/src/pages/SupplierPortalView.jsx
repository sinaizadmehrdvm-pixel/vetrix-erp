import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, FileText, ShieldCheck, Wallet } from "lucide-react";

import { API_URL } from "../services/api";

function money(value) {
  const amount = Number(value || 0);
  return `${amount.toLocaleString()} IRR`;
}

export default function SupplierPortalView() {
  const { token } = useParams();
  const [supplier, setSupplier] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [ledger, setLedger] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

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
          throw new Error("This link is no longer valid.");
        }
        const me = await meResponse.json();
        const invoicesData = await invoicesResponse.json();
        const ledgerData = await ledgerResponse.json();
        if (!active) return;
        setSupplier(me.supplier);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#071028] flex items-center justify-center text-cyan-300 font-bold">
        Loading...
      </div>
    );
  }

  if (error || !supplier) {
    return (
      <div className="min-h-screen bg-[#071028] flex items-center justify-center text-center px-4">
        <div className="text-rose-300">
          <AlertTriangle className="mx-auto mb-3" size={36} />
          <p className="font-bold">{error || "This link is no longer valid."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#071028] text-white px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-cyan-400" size={28} />
          <h1 className="text-2xl font-black text-cyan-400">Vetrix ERP — Supplier Portal</h1>
        </div>

        <section className="rounded-2xl border border-cyan-500/20 bg-[#0b1736] p-6">
          <h2 className="text-xl font-black mb-1">{supplier.name}</h2>
          <p className="text-slate-400 text-sm">
            {[supplier.phone, supplier.email, supplier.city].filter(Boolean).join(" • ") || "—"}
          </p>
        </section>

        <section className="rounded-2xl border border-cyan-500/20 bg-[#0b1736] p-6">
          <div className="flex items-center gap-2 text-cyan-300 font-black mb-3">
            <Wallet size={18} /> Account balance
          </div>
          <div className="text-3xl font-black">{money(supplier.balance)}</div>
        </section>

        <section className="rounded-2xl border border-cyan-500/20 bg-[#0b1736] p-6">
          <div className="flex items-center gap-2 text-cyan-300 font-black mb-4">
            <FileText size={18} /> Purchase invoices
          </div>
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
                  <div className="font-black text-cyan-300">{money(invoice.total_amount)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {ledger && (
          <section className="rounded-2xl border border-cyan-500/20 bg-[#0b1736] p-6">
            <div className="flex items-center gap-2 text-cyan-300 font-black mb-4">
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
