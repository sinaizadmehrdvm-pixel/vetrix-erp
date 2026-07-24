import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, CreditCard, ShieldCheck, XCircle } from "lucide-react";

import { API_URL } from "../services/api";

function money(value) {
  const amount = Number(value || 0);
  return `${amount.toLocaleString()} IRR`;
}

export default function PaymentGatewayView() {
  const { authority } = useParams();
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      const res = await fetch(`${API_URL}/api/payments/session?authority=${encodeURIComponent(authority)}`);
      if (!res.ok) throw new Error("This payment link is no longer valid.");
      const data = await res.json();
      setSession(data);
    } catch (err) {
      setError(err.message || "This payment link is no longer valid.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authority]);

  async function simulate(outcome) {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/payments/session/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authority, outcome }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || "Could not process the payment.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--erp-bg)] flex items-center justify-center text-[var(--erp-accent)] font-bold">
        Loading...
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-[var(--erp-bg)] flex items-center justify-center text-center px-4">
        <div className="text-rose-300">
          <AlertTriangle className="mx-auto mb-3" size={36} />
          <p className="font-bold">{error || "This payment link is no longer valid."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--erp-bg)] text-[var(--erp-text)] px-4 py-8 flex items-center justify-center">
      <div className="max-w-md w-full space-y-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-[var(--erp-accent)]" size={28} />
          <h1 className="text-2xl font-black text-[var(--erp-accent)]">Vetrix ERP — Payment</h1>
        </div>

        <section className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-bg-soft)] p-6 text-center">
          <p className="text-slate-400 text-sm">Invoice #{session.invoice_id}</p>
          <p className="text-slate-400 text-sm mb-3">{session.customer_name}</p>
          <div className="text-4xl font-black mb-4">{money(session.amount)}</div>

          {session.provider === "sandbox" && (
            <div className="mb-4 rounded-xl bg-amber-500/15 border border-amber-400/30 text-amber-100 text-xs px-3 py-2">
              TEST MODE — this is a simulated payment, no real money moves.
            </div>
          )}

          {session.status === "pending" && (
            <div className="flex flex-col gap-3">
              <button
                onClick={() => simulate("success")}
                disabled={submitting}
                className="rounded-xl bg-emerald-400 text-slate-950 font-black px-4 py-3 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <CreditCard size={18} />
                {submitting ? "Processing..." : "Pay now (sandbox)"}
              </button>
              <button
                onClick={() => simulate("failure")}
                disabled={submitting}
                className="rounded-xl bg-white/10 text-slate-200 font-bold px-4 py-3 disabled:opacity-60"
              >
                Simulate failed payment
              </button>
            </div>
          )}

          {session.status === "success" && (
            <div className="text-emerald-300 flex flex-col items-center gap-2">
              <CheckCircle2 size={40} />
              <p className="font-black">Payment successful</p>
            </div>
          )}

          {session.status === "failed" && (
            <div className="text-rose-300 flex flex-col items-center gap-2">
              <XCircle size={40} />
              <p className="font-black">Payment failed</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
