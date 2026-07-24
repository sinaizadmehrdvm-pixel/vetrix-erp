import { useEffect, useMemo, useState } from "react";
import { Layers, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/useLanguage";
import {
  createPriceTier,
  deletePriceTier,
  getPriceTiers,
  getProducts,
} from "../services/api";

const cardClass = "rounded-2xl border border-white/10 bg-white/5 p-5";
const inputClass = "w-full mb-3 p-3 rounded-xl bg-black/20 border border-white/10 outline-none focus:ring-2 focus:ring-cyan-400";

export default function PricingTiers() {
  const { dir, language, money } = useLanguage();
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
      toast.error(fa ? "یک کالا انتخاب کنید." : "Select a product.");
      return;
    }
    if (!minQuantity || !unitPrice) {
      toast.error(fa ? "حداقل تعداد و قیمت را وارد کنید." : "Enter a minimum quantity and unit price.");
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
      toast.success(fa ? "پله قیمتی اضافه شد." : "Price tier added.");
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
      toast.success(fa ? "پله قیمتی حذف شد." : "Price tier removed.");
      await loadTiers(productId);
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div dir={dir} className="p-4 md:p-6 space-y-6 text-white">
      <h1 className="text-2xl font-black flex items-center gap-2">
        <Layers className="text-cyan-400" />
        {fa ? "قیمت‌گذاری پلکانی و عمده‌فروشی" : "Tiered & wholesale pricing"}
      </h1>

      <section className={cardClass}>
        <label className="block text-sm text-slate-300 mb-2">
          {fa ? "انتخاب کالا" : "Select product"}
        </label>
        <select
          className={inputClass}
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          disabled={loading}
        >
          <option value="">{fa ? "یک کالا انتخاب کنید..." : "Choose a product..."}</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {selectedProduct && (
          <p className="text-sm text-slate-400 mb-4">
            {fa ? "قیمت پایه: " : "Base price: "}{money(selectedProduct.sell_price || selectedProduct.price || 0)}
          </p>
        )}

        {productId && (
          <>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <input
                type="number"
                min="1"
                className={inputClass + " mb-0"}
                placeholder={fa ? "حداقل تعداد" : "Min quantity"}
                value={minQuantity}
                onChange={(e) => setMinQuantity(e.target.value)}
              />
              <input
                type="number"
                min="0"
                className={inputClass + " mb-0"}
                placeholder={fa ? "قیمت واحد" : "Unit price"}
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
              <select
                className={inputClass + " mb-0"}
                value={customerGroup}
                onChange={(e) => setCustomerGroup(e.target.value)}
              >
                <option value="">{fa ? "همه مشتریان" : "All customers"}</option>
                <option value="retail">{fa ? "فقط خرده‌فروشی" : "Retail only"}</option>
                <option value="wholesale">{fa ? "فقط عمده‌فروشی" : "Wholesale only"}</option>
              </select>
              <button
                type="submit"
                disabled={creating}
                className="rounded-xl bg-cyan-400 text-black font-black px-4 py-3 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <Plus size={16} />
                {fa ? "افزودن پله" : "Add tier"}
              </button>
            </form>

            <div className="space-y-2">
              {tiers.length === 0 ? (
                <p className="text-slate-400">{fa ? "پله قیمتی تعریف نشده است." : "No price tiers yet."}</p>
              ) : (
                tiers.map((tier) => (
                  <div key={tier.id} className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-3">
                    <div className="text-sm">
                      {fa ? "از " : "From "} {tier.min_quantity} {fa ? "عدد به بعد: " : "units: "}
                      <span className="font-black text-cyan-300">{money(tier.unit_price)}</span>
                      {tier.customer_group && (
                        <span className="ms-2 text-xs px-2 py-1 rounded-lg bg-white/10">
                          {tier.customer_group === "wholesale" ? (fa ? "عمده" : "wholesale") : (fa ? "خرده" : "retail")}
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
