import { useEffect, useMemo, useState } from "react";
import { Layers, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, cleanNumberInput } from "../localization/helpers";
import {
  createPriceTier,
  deletePriceTier,
  getPriceTiers,
  getProducts,
} from "../services/api";

const cardClass = "rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-panel)] p-5";
const inputClass = "w-full mb-3 p-3 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] outline-none focus:ring-2 focus:ring-cyan-400";

export default function PricingTiers() {
  const { dir, language, money, n } = useLanguage();
  const fa = language === "fa";

  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState("");
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [minQuantity, setMinQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [customerGroup, setCustomerGroup] = useState("");

  const selectedProduct = useMemo(
    () => products.find((p) => String(p.id) === String(productId)),
    [products, productId]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      getProducts()
        .then((data) => setProducts(Array.isArray(data) ? data : []))
        .catch((err) => toast.error(err.message))
        .finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function loadTiers(forProductId) {
    if (!forProductId) {
      setTiers([]);
      return;
    }
    try {
      const data = await getPriceTiers(forProductId);
      setTiers(data.items || []);
    } catch (err) {
      toast.error(err.message);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void loadTiers(productId); }, 0);
    return () => clearTimeout(timer);
  }, [productId]);

  async function handleCreate(event) {
    event.preventDefault();
    if (!productId) {
      toast.error(language === "fa" ? "یک کالا انتخاب کنید." : language === "ar" ? "اختر منتجًا." : language === "tr" ? "Bir ürün seçin." : "Select a product.");
      return;
    }
    if (!minQuantity || !unitPrice) {
      toast.error(language === "fa" ? "حداقل تعداد و قیمت را وارد کنید." : language === "ar" ? "أدخل الحد الأدنى للكمية وسعر الوحدة." : language === "tr" ? "Minimum miktar ve birim fiyatı girin." : "Enter a minimum quantity and unit price.");
      return;
    }
    setCreating(true);
    try {
      await createPriceTier({
        product_id: Number(productId),
        min_quantity: Number(minQuantity),
        unit_price: Number(unitPrice),
        customer_group: customerGroup || null,
      });
      toast.success(language === "fa" ? "پله قیمتی اضافه شد." : language === "ar" ? "تمت إضافة الشريحة السعرية." : language === "tr" ? "Fiyat kademesi eklendi." : "Price tier added.");
      setMinQuantity("");
      setUnitPrice("");
      setCustomerGroup("");
      await loadTiers(productId);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deletePriceTier(id);
      toast.success(language === "fa" ? "پله قیمتی حذف شد." : language === "ar" ? "تم حذف الشريحة السعرية." : language === "tr" ? "Fiyat kademesi silindi." : "Price tier removed.");
      await loadTiers(productId);
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div dir={dir} className="p-4 md:p-6 space-y-6 text-[var(--erp-text)]">
      <h1 className="text-2xl font-black flex items-center gap-2">
        <Layers className="text-[var(--erp-accent)]" />
        {language === "fa" ? "قیمت‌گذاری پلکانی و عمده‌فروشی" : language === "ar" ? "التسعير المتدرج والجملة" : language === "tr" ? "Kademeli ve toptan fiyatlandırma" : "Tiered & wholesale pricing"}
      </h1>

      <section className={cardClass}>
        <label className="block text-sm text-[var(--erp-muted)] mb-2">
          {language === "fa" ? "انتخاب کالا" : language === "ar" ? "اختيار المنتج" : language === "tr" ? "Ürün Seç" : "Select product"}
        </label>
        <select
          className={inputClass}
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          disabled={loading}
        >
          <option value="">{language === "fa" ? "یک کالا انتخاب کنید..." : language === "ar" ? "اختر منتجًا..." : language === "tr" ? "Bir ürün seçin..." : "Choose a product..."}</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {selectedProduct && (
          <p className="text-sm text-[var(--erp-muted)] mb-4">
            {language === "fa" ? "قیمت پایه: " : language === "ar" ? "السعر الأساسي: " : language === "tr" ? "Taban fiyat: " : "Base price: "}{money(selectedProduct.sell_price || selectedProduct.price || 0)}
          </p>
        )}

        {productId && (
          <>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <input
                type="text"
                inputMode="numeric"
                className={inputClass + " mb-0"}
                placeholder={fa ? "حداقل تعداد" : language === "ar" ? "الحد الأدنى للكمية" : language === "tr" ? "Asgari miktar" : "Min quantity"}
                value={language === "fa" ? toPersianDigits(minQuantity) : minQuantity}
                onChange={(e) => setMinQuantity(cleanNumberInput(e.target.value))}
              />
              <input
                type="text"
                inputMode="numeric"
                className={inputClass + " mb-0"}
                placeholder={fa ? "قیمت واحد" : language === "ar" ? "سعر الوحدة" : language === "tr" ? "Birim fiyat" : "Unit price"}
                value={language === "fa" ? toPersianDigits(unitPrice) : unitPrice}
                onChange={(e) => setUnitPrice(cleanNumberInput(e.target.value))}
              />
              <select
                className={inputClass + " mb-0"}
                value={customerGroup}
                onChange={(e) => setCustomerGroup(e.target.value)}
              >
                <option value="">{fa ? "همه مشتریان" : language === "ar" ? "جميع العملاء" : language === "tr" ? "Tüm müşteriler" : "All customers"}</option>
                <option value="retail">{fa ? "فقط خرده‌فروشی" : language === "ar" ? "بيع بالتجزئة فقط" : language === "tr" ? "Sadece perakende" : "Retail only"}</option>
                <option value="wholesale">{fa ? "فقط عمده‌فروشی" : language === "ar" ? "بيع بالجملة فقط" : language === "tr" ? "Sadece toptan" : "Wholesale only"}</option>
              </select>
              <button
                type="submit"
                disabled={creating}
                className="rounded-xl bg-[var(--erp-accent)] text-black font-black px-4 py-3 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <Plus size={16} />
                {fa ? "افزودن پله" : language === "ar" ? "إضافة شريحة" : language === "tr" ? "Kademe ekle" : "Add tier"}
              </button>
            </form>

            <div className="space-y-2">
              {tiers.length === 0 ? (
                <p className="text-[var(--erp-muted)]">{fa ? "پله قیمتی تعریف نشده است." : language === "ar" ? "لم يتم تعريف أي شريحة سعرية بعد." : language === "tr" ? "Henüz fiyat kademesi tanımlanmadı." : "No price tiers yet."}</p>
              ) : (
                tiers.map((tier) => (
                  <div key={tier.id} className="flex items-center justify-between rounded-xl bg-[var(--erp-panel-solid)] px-4 py-3">
                    <div className="text-sm">
                      {fa ? "از " : language === "ar" ? "من " : language === "tr" ? "" : "From "} {n(tier.min_quantity)} {fa ? "عدد به بعد: " : language === "ar" ? "وحدة فأكثر: " : language === "tr" ? "birimden itibaren: " : "units: "}
                      <span className="font-black text-[var(--erp-accent)]">{money(tier.unit_price)}</span>
                      {tier.customer_group && (
                        <span className="ms-2 text-xs px-2 py-1 rounded-lg bg-[var(--erp-panel-solid)]">
                          {tier.customer_group === "wholesale" ? (fa ? "عمده" : language === "ar" ? "جملة" : language === "tr" ? "toptan" : "wholesale") : (fa ? "خرده" : language === "ar" ? "تجزئة" : language === "tr" ? "perakende" : "retail")}
                        </span>
                      )}
                    </div>
                    <button onClick={() => handleDelete(tier.id)} className="text-red-300 hover:text-red-200">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
