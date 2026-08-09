import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, BadgePercent, BookOpen, CheckCircle2, ImageOff, Minus, Package, Plus, ShoppingCart } from "lucide-react";

import { API_URL } from "../services/api";
import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, toEnglishDigits, cleanNumberInput } from "../localization/helpers";

export default function CatalogPublicView() {
  const { token } = useParams();
  const { language, dir, money } = useLanguage();
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;
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

  const invalidLinkMessage = tr("این لینک کاتالوگ دیگر معتبر نیست.", "رابط الكتالوج هذا لم يعد صالحاً.", "Bu katalog bağlantısı artık geçerli değil.", "This catalog link is no longer valid.");

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

  function setQuantity(id, value) {
    setQuantities((prev) => ({ ...prev, [id]: value }));
  }

  function step(id, delta, max) {
    const current = Number(quantities[id] || 0);
    const next = Math.max(0, Math.min(max ?? Infinity, current + delta));
    setQuantity(id, next ? String(next) : "");
  }

  const selectedItems = useMemo(
    () => Object.entries(quantities).filter(([, qty]) => Number(qty) > 0),
    [quantities]
  );

  const cartTotal = useMemo(() => {
    return selectedItems.reduce((sum, [productId, qty]) => {
      const item = items.find((i) => String(i.id) === String(productId));
      const unitPrice = item ? (item.final_price ?? item.price) : 0;
      return sum + unitPrice * Number(qty);
    }, 0);
  }, [selectedItems, items]);

  async function submitOrder(event) {
    event.preventDefault();
    setSubmitError("");
    if (!customerName.trim()) {
      setSubmitError(tr("نام خود را وارد کنید.", "أدخل اسمك.", "Adınızı girin.", "Enter your name."));
      return;
    }
    if (selectedItems.length === 0) {
      setSubmitError(tr("حداقل یک کالا و تعداد آن را انتخاب کنید.", "اختر منتجاً واحداً على الأقل وحدد الكمية.", "En az bir ürün ve miktarını seçin.", "Choose at least one product and a quantity."));
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
      if (!response.ok) throw new Error(data?.detail || tr("ثبت سفارش ممکن نشد.", "تعذّر تقديم الطلب.", "Sipariş gönderilemedi.", "Couldn't submit your order."));
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
        {tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}
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
    <div dir={dir} className="min-h-screen bg-[var(--erp-bg)] text-[var(--erp-text)]">
      <header className="sticky top-0 z-10 border-b border-[var(--erp-border)] bg-[var(--erp-bg)]/95 backdrop-blur px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl grid place-items-center shrink-0" style={{ background: "linear-gradient(135deg,var(--erp-accent),var(--erp-accent-2))", color: "#071028" }}>
              <BookOpen size={22} />
            </div>
            <div>
              <h1 className="text-lg font-black" style={{ color: "var(--erp-accent)" }}>{title}</h1>
              <p className="text-xs text-[var(--erp-muted)]">{tr(`${items.length} کالا`, `${items.length} منتج`, `${items.length} ürün`, `${items.length} products`)}</p>
            </div>
          </div>
          {selectedItems.length > 0 && (
            <div className="flex items-center gap-2 rounded-2xl px-3 py-2" style={{ background: "var(--erp-glow)", color: "var(--erp-accent)" }}>
              <ShoppingCart size={16} />
              <span className="text-sm font-black">{selectedItems.length}</span>
              <span className="text-xs font-bold hidden sm:inline">{money(cartTotal)}</span>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <section
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
        >
          {items.map((item) => {
            const hasDiscount = Number(item.discount_percent) > 0;
            const qty = quantities[item.id] || "";
            return (
              <div
                key={item.id}
                className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-bg-soft)] overflow-hidden flex flex-col"
                style={{ opacity: item.in_stock ? 1 : 0.6 }}
              >
                <div className="relative aspect-square bg-black/20 flex items-center justify-center">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <ImageOff size={32} className="text-[var(--erp-muted)]" />
                  )}
                  {hasDiscount && (
                    <span className="absolute top-2 inset-inline-start-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-black bg-rose-500 text-white">
                      <BadgePercent size={12} /> {tr(`${item.discount_percent.toFixed(0)}٪`, `${item.discount_percent.toFixed(0)}٪`, `%${item.discount_percent.toFixed(0)}`, `-${item.discount_percent.toFixed(0)}%`)}
                    </span>
                  )}
                  {!item.in_stock && (
                    <span className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-sm font-black">
                      {tr("ناموجود", "غير متوفر", "Stokta yok", "Out of stock")}
                    </span>
                  )}
                </div>

                <div className="p-3 flex flex-col gap-2 flex-1">
                  <div className="font-bold text-sm leading-snug line-clamp-2" title={item.name}>{item.name}</div>
                  <div className="mt-auto">
                    {hasDiscount ? (
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-xs text-[var(--erp-muted)] line-through">{money(item.price)}</span>
                        <span className="font-black text-rose-400">{money(item.final_price)}</span>
                      </div>
                    ) : (
                      <div className="font-black">{money(item.price)}</div>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-1">
                    <button
                      type="button"
                      disabled={!item.in_stock || !qty}
                      onClick={() => step(item.id, -1)}
                      className="w-8 h-8 rounded-lg grid place-items-center bg-black/20 disabled:opacity-30"
                      aria-label={tr("کاهش", "إنقاص", "Azalt", "Decrease")}
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      disabled={!item.in_stock}
                      value={language === "fa" ? toPersianDigits(qty) : qty}
                      onChange={(e) => setQuantity(item.id, cleanNumberInput(e.target.value))}
                      className="w-12 p-1 rounded-lg bg-black/20 border border-white/10 text-center disabled:opacity-40"
                      placeholder="0"
                    />
                    <button
                      type="button"
                      disabled={!item.in_stock}
                      onClick={() => step(item.id, 1)}
                      className="w-8 h-8 rounded-lg grid place-items-center disabled:opacity-30"
                      style={{ background: "var(--erp-accent)", color: "#071028" }}
                      aria-label={tr("افزایش", "زيادة", "Artır", "Increase")}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="col-span-full flex flex-col items-center gap-2 text-[var(--erp-muted)] py-10">
              <Package size={30} />
              {tr("کالایی در این کاتالوگ نیست.", "لا توجد منتجات في هذا الكتالوج.", "Bu katalogda ürün yok.", "No products in this catalog.")}
            </div>
          )}
        </section>

        {submitted ? (
          <section className="rounded-2xl border border-emerald-400/30 bg-emerald-950/30 p-6 text-emerald-200 flex items-center gap-3">
            <CheckCircle2 />
            {tr("سفارش شما ثبت شد. به‌زودی برای تأیید با شما تماس می‌گیریم.", "تم استلام طلبك. سنتصل بك قريباً للتأكيد.", "Siparişiniz alındı. Onay için kısa süre içinde sizinle iletişime geçeceğiz.", "Your order was submitted. We'll contact you shortly to confirm.")}
          </section>
        ) : (
          <section className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-bg-soft)] p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-black flex items-center gap-2"><ShoppingCart size={18} /> {tr("ثبت سفارش", "تقديم الطلب", "Sipariş ver", "Place an order")}</h2>
              {selectedItems.length > 0 && <span className="text-sm font-black" style={{ color: "var(--erp-accent)" }}>{money(cartTotal)}</span>}
            </div>
            <form onSubmit={submitOrder}>
              <input
                className="w-full mb-3 p-3 rounded-xl bg-black/20 border border-white/10 outline-none"
                placeholder={tr("نام شما", "اسمك", "Adınız", "Your name")}
                value={customerName}
                onChange={(e) => setCustomerName(language === "fa" ? toPersianDigits(e.target.value) : e.target.value)}
              />
              <input
                className="w-full mb-3 p-3 rounded-xl bg-black/20 border border-white/10 outline-none"
                placeholder={tr("شماره تماس", "رقم الهاتف", "Telefon numarası", "Phone number")}
                value={language === "fa" ? toPersianDigits(customerPhone) : customerPhone}
                onChange={(e) => setCustomerPhone(toEnglishDigits(e.target.value))}
              />
              <textarea
                className="w-full mb-3 p-3 rounded-xl bg-black/20 border border-white/10 outline-none"
                placeholder={tr("توضیحات (اختیاری)", "ملاحظات (اختياري)", "Not (isteğe bağlı)", "Note (optional)")}
                value={note}
                onChange={(e) => setNote(language === "fa" ? toPersianDigits(e.target.value) : e.target.value)}
              />
              {submitError && <div className="mb-3 text-rose-300 text-sm">{submitError}</div>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-[var(--erp-accent)] text-black font-black py-3 disabled:opacity-60"
              >
                {submitting ? tr("در حال ثبت...", "جارٍ الإرسال...", "Gönderiliyor...", "Submitting...") : tr("ثبت سفارش", "تقديم الطلب", "Sipariş ver", "Submit order")}
              </button>
            </form>
          </section>
        )}
      </div>
    </div>
  );
}
