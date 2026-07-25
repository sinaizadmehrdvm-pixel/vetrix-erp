import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, BookOpen, CheckCircle2, ShoppingCart } from "lucide-react";

import { API_URL } from "../services/api";
import { useLanguage } from "../localization/useLanguage";

export default function CatalogPublicView() {
  const { token } = useParams();
  const { language, dir, money } = useLanguage();
  const fa = language === "fa";
  const [title, setTitle] = useState("");
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState({});
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const invalidLinkMessage = fa ? "این لینک کاتالوگ دیگر معتبر نیست." : "This catalog link is no longer valid.";

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(`${API_URL}/api/catalog/view`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error(invalidLinkMessage);
        const data = await response.json();
        if (!active) return;
        setTitle(data.title);
        setItems(data.items || []);
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

  const selectedItems = useMemo(
    () => Object.entries(quantities).filter(([, qty]) => Number(qty) > 0),
    [quantities]
  );

  async function submitOrder(event) {
    event.preventDefault();
    setSubmitError("");
    if (!customerName.trim()) {
      setSubmitError(fa ? "نام خود را وارد کنید." : "Enter your name.");
      return;
    }
    if (selectedItems.length === 0) {
      setSubmitError(fa ? "حداقل یک کالا و تعداد آن را انتخاب کنید." : "Choose at least one product and a quantity.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/catalog/view/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          note: note.trim(),
          items: selectedItems.map(([productId, quantity]) => ({
            product_id: Number(productId),
            quantity: Number(quantity),
          })),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.detail || (fa ? "ثبت سفارش ممکن نشد." : "Couldn't submit your order."));
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div dir={dir} className="min-h-screen bg-[var(--erp-bg)] flex items-center justify-center text-[var(--erp-accent)] font-bold">
        {fa ? "در حال بارگذاری..." : "Loading..."}
      </div>
    );
  }

  if (error) {
    return (
      <div dir={dir} className="min-h-screen bg-[var(--erp-bg)] flex items-center justify-center text-center px-4">
        <div className="text-rose-300">
          <AlertTriangle className="mx-auto mb-3" size={36} />
          <p className="font-bold">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div dir={dir} className="min-h-screen bg-[var(--erp-bg)] text-[var(--erp-text)] px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <BookOpen className="text-[var(--erp-accent)]" size={28} />
          <h1 className="text-2xl font-black text-[var(--erp-accent)]">{title}</h1>
        </div>

        <section className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-bg-soft)] p-6">
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-4 py-3">
                <div>
                  <div className="font-bold">{item.name}</div>
                  <div className="text-xs text-[var(--erp-muted)]">
                    {money(item.price)} {!item.in_stock && (fa ? "• ناموجود" : "• Out of stock")}
                  </div>
                </div>
                <input
                  type="number"
                  min="0"
                  disabled={!item.in_stock}
                  value={quantities[item.id] || ""}
                  onChange={(e) => setQuantities({ ...quantities, [item.id]: e.target.value })}
                  className="w-20 p-2 rounded-lg bg-black/30 border border-white/10 text-center disabled:opacity-40"
                  placeholder="0"
                />
              </div>
            ))}
          </div>
        </section>

        {submitted ? (
          <section className="rounded-2xl border border-emerald-400/30 bg-emerald-950/30 p-6 text-emerald-200 flex items-center gap-3">
            <CheckCircle2 />
            {fa ? "سفارش شما ثبت شد. به‌زودی برای تأیید با شما تماس می‌گیریم." : "Your order was submitted. We'll contact you shortly to confirm."}
          </section>
        ) : (
          <section className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-bg-soft)] p-6">
            <h2 className="font-black mb-3 flex items-center gap-2"><ShoppingCart size={18} /> {fa ? "ثبت سفارش" : "Place an order"}</h2>
            <form onSubmit={submitOrder}>
              <input
                className="w-full mb-3 p-3 rounded-xl bg-black/20 border border-white/10 outline-none"
                placeholder={fa ? "نام شما" : "Your name"}
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
              <input
                className="w-full mb-3 p-3 rounded-xl bg-black/20 border border-white/10 outline-none"
                placeholder={fa ? "شماره تماس" : "Phone number"}
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
              <textarea
                className="w-full mb-3 p-3 rounded-xl bg-black/20 border border-white/10 outline-none"
                placeholder={fa ? "توضیحات (اختیاری)" : "Note (optional)"}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              {submitError && <div className="mb-3 text-rose-300 text-sm">{submitError}</div>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-[var(--erp-accent)] text-black font-black py-3 disabled:opacity-60"
              >
                {submitting ? (fa ? "در حال ثبت..." : "Submitting...") : (fa ? "ثبت سفارش" : "Submit order")}
              </button>
            </form>
          </section>
        )}
      </div>
    </div>
  );
}
