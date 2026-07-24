import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Plus, ShieldOff, Warehouse as WarehouseIcon } from "lucide-react";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/useLanguage";
import {
  createWarehouse,
  deactivateWarehouse,
  getProducts,
  getWarehouseProducts,
  getWarehouseStockBreakdown,
  getWarehouses,
  transferWarehouseStock,
} from "../services/api";

const cardClass = "rounded-2xl border border-white/10 bg-white/5 p-5";
const inputClass = "w-full mb-3 p-3 rounded-xl bg-black/20 border border-white/10 outline-none focus:ring-2 focus:ring-cyan-400";
const buttonClass = "rounded-xl bg-cyan-400 text-black font-black px-4 py-3 disabled:opacity-60 flex items-center gap-2";

export default function Warehouses() {
  const { dir, language, n } = useLanguage();
  const fa = language === "fa";

  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [transferring, setTransferring] = useState(false);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const [breakdownProductId, setBreakdownProductId] = useState("");
  const [breakdown, setBreakdown] = useState(null);

  const [transferProductId, setTransferProductId] = useState("");
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");

  const [browseWarehouseId, setBrowseWarehouseId] = useState("");
  const [warehouseItems, setWarehouseItems] = useState(null);

  const activeWarehouses = useMemo(() => warehouses.filter((w) => w.active), [warehouses]);

  async function loadAll() {
    setLoading(true);
    try {
      const [warehousesData, productsData] = await Promise.all([getWarehouses(), getProducts()]);
      setWarehouses(warehousesData.items || []);
      setProducts(Array.isArray(productsData) ? productsData : []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void loadAll(); }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error(fa ? "نام انبار را وارد کنید." : "Enter a warehouse name.");
      return;
    }
    setCreating(true);
    try {
      await createWarehouse({ name: name.trim(), code });
      toast.success(fa ? "انبار ساخته شد." : "Warehouse created.");
      setName("");
      setCode("");
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDeactivate(id) {
    try {
      await deactivateWarehouse(id);
      toast.success(fa ? "انبار غیرفعال شد." : "Warehouse deactivated.");
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function loadBreakdown(productId) {
    setBreakdownProductId(productId);
    if (!productId) {
      setBreakdown(null);
      return;
    }
    try {
      const data = await getWarehouseStockBreakdown(productId);
      setBreakdown(data);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function loadWarehouseItems(warehouseId) {
    setBrowseWarehouseId(warehouseId);
    if (!warehouseId) {
      setWarehouseItems(null);
      return;
    }
    try {
      const data = await getWarehouseProducts(warehouseId);
      setWarehouseItems(data);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleTransfer(event) {
    event.preventDefault();
    if (!transferProductId || !fromWarehouseId || !toWarehouseId) {
      toast.error(fa ? "همه فیلدها را پر کنید." : "Fill in all fields.");
      return;
    }
    if (fromWarehouseId === toWarehouseId) {
      toast.error(fa ? "انبار مبدا و مقصد باید متفاوت باشند." : "Source and destination must differ.");
      return;
    }
    setTransferring(true);
    try {
      await transferWarehouseStock({
        product_id: Number(transferProductId),
        from_warehouse_id: Number(fromWarehouseId),
        to_warehouse_id: Number(toWarehouseId),
        quantity: Number(quantity),
        note,
      });
      toast.success(fa ? "انتقال انجام شد." : "Transfer completed.");
      setQuantity("");
      setNote("");
      if (String(transferProductId) === String(breakdownProductId)) {
        await loadBreakdown(breakdownProductId);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setTransferring(false);
    }
  }

  return (
    <div dir={dir} className="p-4 md:p-6 space-y-6 text-white">
      <h1 className="text-2xl font-black flex items-center gap-2">
        <WarehouseIcon className="text-cyan-400" />
        {fa ? "شعبه‌ها و انبارهای متعدد" : "Multi-branch warehouses"}
      </h1>

      <section className={cardClass}>
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Plus size={18} /> {fa ? "ساخت انبار/شعبه جدید" : "Create a new warehouse/branch"}
        </h2>
        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            className={inputClass + " mb-0"}
            placeholder={fa ? "نام انبار (مثلاً «شعبه شمال»)" : "Warehouse name (e.g. \"North branch\")"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className={inputClass + " mb-0"}
            placeholder={fa ? "کد (اختیاری)" : "Code (optional)"}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button type="submit" disabled={creating} className={buttonClass}>
            <Plus size={16} />
            {creating ? (fa ? "در حال ساخت..." : "Creating...") : (fa ? "ساخت" : "Create")}
          </button>
        </form>
      </section>

      <section className={cardClass}>
        <h2 className="text-lg font-bold mb-4">{fa ? "لیست انبارها" : "Warehouses"}</h2>
        {loading ? (
          <p className="text-slate-400">{fa ? "در حال بارگذاری..." : "Loading..."}</p>
        ) : (
          <div className="space-y-2">
            {warehouses.map((w) => (
              <div key={w.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/20 px-4 py-3">
                <div>
                  <div className="font-bold">
                    {w.name}
                    {w.is_default && (
                      <span className="ms-2 text-xs px-2 py-1 rounded-lg bg-cyan-500/20 text-cyan-200">
                        {fa ? "پیش‌فرض" : "Default"}
                      </span>
                    )}
                    {!w.active && (
                      <span className="ms-2 text-xs px-2 py-1 rounded-lg bg-red-500/15 text-red-200">
                        {fa ? "غیرفعال" : "Inactive"}
                      </span>
                    )}
                  </div>
                  {w.code && <div className="text-xs text-slate-400">{w.code}</div>}
                </div>
                {!w.is_default && w.active && (
                  <button
                    onClick={() => handleDeactivate(w.id)}
                    className="px-3 py-2 rounded-xl bg-red-500/15 text-red-200 text-sm font-bold flex items-center gap-1"
                  >
                    <ShieldOff size={14} /> {fa ? "غیرفعال کردن" : "Deactivate"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={cardClass}>
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <ArrowRightLeft size={18} /> {fa ? "انتقال موجودی بین انبارها" : "Transfer stock between warehouses"}
        </h2>
        <form onSubmit={handleTransfer} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select
            className={inputClass}
            value={transferProductId}
            onChange={(e) => setTransferProductId(e.target.value)}
          >
            <option value="">{fa ? "انتخاب کالا..." : "Select product..."}</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            className={inputClass}
            placeholder={fa ? "تعداد" : "Quantity"}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <select className={inputClass} value={fromWarehouseId} onChange={(e) => setFromWarehouseId(e.target.value)}>
            <option value="">{fa ? "از انبار..." : "From warehouse..."}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <select className={inputClass} value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)}>
            <option value="">{fa ? "به انبار..." : "To warehouse..."}</option>
            {activeWarehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <textarea
            className={inputClass + " md:col-span-2"}
            placeholder={fa ? "یادداشت (اختیاری)" : "Note (optional)"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button type="submit" disabled={transferring} className={buttonClass}>
            <ArrowRightLeft size={16} />
            {transferring ? (fa ? "در حال انتقال..." : "Transferring...") : (fa ? "انتقال" : "Transfer")}
          </button>
        </form>
      </section>

      <section className={cardClass}>
        <h2 className="text-lg font-bold mb-4">{fa ? "موجودی هر کالا به تفکیک انبار" : "Stock breakdown per product"}</h2>
        <select
          className={inputClass}
          value={breakdownProductId}
          onChange={(e) => void loadBreakdown(e.target.value)}
        >
          <option value="">{fa ? "انتخاب کالا..." : "Select product..."}</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {breakdown && (
          <div className="space-y-2 mt-3">
            <p className="text-sm text-slate-400">
              {fa ? "مجموع کل: " : "Total: "}{n(breakdown.total)}
            </p>
            {breakdown.by_warehouse.map((row) => (
              <div key={row.warehouse_id} className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-3">
                <span>{row.warehouse_name}</span>
                <span className="font-black text-cyan-300">{n(row.quantity)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={cardClass}>
        <h2 className="text-lg font-bold mb-4">{fa ? "کالاهای هر انبار" : "Products by warehouse"}</h2>
        <select
          className={inputClass}
          value={browseWarehouseId}
          onChange={(e) => void loadWarehouseItems(e.target.value)}
        >
          <option value="">{fa ? "انتخاب انبار..." : "Select warehouse..."}</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        {warehouseItems && (
          warehouseItems.items.length === 0 ? (
            <p className="text-slate-400 mt-3">{fa ? "کالایی در این انبار نیست." : "No stock in this warehouse."}</p>
          ) : (
            <div className="space-y-2 mt-3">
              {warehouseItems.items.map((item) => (
                <div key={item.product_id} className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-3">
                  <span>{item.product_name}</span>
                  <span className="font-black text-cyan-300">{n(item.quantity)}</span>
                </div>
              ))}
            </div>
          )
        )}
      </section>
    </div>
  );
}
