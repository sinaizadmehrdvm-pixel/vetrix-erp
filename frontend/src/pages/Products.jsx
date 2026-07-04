import { useEffect, useMemo, useState } from "react";
import {
  Package,
  Search,
  Plus,
  RefreshCw,
  AlertTriangle,
  Edit3,
  Save,
  X,
  ImagePlus,
  Boxes,
  Trash2,
} from "lucide-react";

import { useLanguage } from "../localization/LanguageContext";
import {
  createProduct,
  getProducts,
  updateProduct,
  deleteProduct,
} from "../services/api";

import { getCache, setCache } from "../storage/db";
import { toPersianDigits, toEnglishDigits } from "../localization/helpers";

const PRODUCTS_CACHE_KEY = "products";

const empty = {
  name: "",
  code: "",
  barcode: "",
  sku: "",
  brand: "",
  unit: "",
  buy_price: "",
  sell_price: "",
  stock: "",
  min_stock: "",
  main_category: "",
  sub_category: "",
  image: "",
};

const unitOptionsFa = [
  "عدد",
  "دستگاه",
  "کارتن",
  "بسته",
  "جعبه",
  "ست",
  "جفت",
  "کیلوگرم",
  "گرم",
  "متر",
  "لیتر",
  "بطری",
  "رول",
  "شاخه",
];

const unitOptionsEn = [
  "pcs",
  "device",
  "carton",
  "pack",
  "box",
  "set",
  "pair",
  "kg",
  "g",
  "m",
  "liter",
  "bottle",
  "roll",
  "branch",
];

const inputClass =
  "bg-slate-800 text-white placeholder-slate-400 border border-cyan-500/10 focus:border-cyan-400 rounded-2xl p-4 outline-none transition-all w-full";

function toNumber(value) {
  const cleaned = toEnglishDigits(String(value ?? ""))
    .replace(/[,،]/g, "")
    .replace(/[^\d.-]/g, "");
  return Number(cleaned || 0);
}

function faText(value, fa) {
  if (value === null || value === undefined) return "";
  return fa ? toPersianDigits(String(value)) : String(value);
}

function normalizeNumberInput(value, fa) {
  const cleaned = toEnglishDigits(String(value || ""))
    .replace(/[,،]/g, "")
    .replace(/[^\d.-]/g, "");
  return fa ? toPersianDigits(cleaned) : cleaned;
}

function productKey(item = {}) {
  return String(item.id || item.barcode || item.code || item.name || "");
}

function normalizeProduct(item = {}) {
  const sell = item.sell_price ?? item.price ?? 0;

  return {
    ...empty,
    ...item,
    code: item.code || item.barcode || "",
    barcode: item.barcode || item.code || "",
    sell_price: sell,
    price: item.price ?? sell,
    buy_price: item.buy_price ?? item.purchase_price ?? 0,
    stock: item.stock ?? 0,
    min_stock: item.min_stock ?? item.minimum_stock ?? 0,
    unit: item.unit || "عدد",
    brand: item.brand || "",
    sku: item.sku || "",
    main_category: item.main_category || "",
    sub_category: item.sub_category || "",
    image: item.image || "",
  };
}

function mergeServerWithCache(serverItems = [], cachedItems = []) {
  const cacheMap = new Map();

  cachedItems.map(normalizeProduct).forEach((item) => {
    cacheMap.set(productKey(item), item);
    if (item.barcode) cacheMap.set(String(item.barcode), item);
    if (item.code) cacheMap.set(String(item.code), item);
  });

  return serverItems.map((serverRaw) => {
    const server = normalizeProduct(serverRaw);
    const cached =
      cacheMap.get(productKey(server)) ||
      cacheMap.get(String(server.barcode || "")) ||
      cacheMap.get(String(server.code || ""));

    if (!cached) return server;

    return normalizeProduct({
      ...cached,
      ...server,
      buy_price:
        toNumber(server.buy_price) > 0 ? server.buy_price : cached.buy_price,
      min_stock:
        toNumber(server.min_stock) > 0 ? server.min_stock : cached.min_stock,
      unit: server.unit && server.unit !== "عدد" ? server.unit : cached.unit || server.unit,
      brand: server.brand || cached.brand,
      sku: server.sku || cached.sku,
      main_category: server.main_category || cached.main_category,
      sub_category: server.sub_category || cached.sub_category,
      image: server.image || cached.image,
    });
  });
}

function Field({ label, children, hint }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-bold text-cyan-200 block">{label}</label>
      {children}
      {hint ? <div className="text-xs text-slate-400">{hint}</div> : null}
    </div>
  );
}

export default function Products() {
  const { language, n, money, dir } = useLanguage();
  const fa = language === "fa";
  const unitOptions = fa ? unitOptionsFa : unitOptionsEn;

  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ ...empty, unit: fa ? "عدد" : "pcs" });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [offlineMode, setOfflineMode] = useState(false);

  const label = {
    title: fa ? "کالاها و خدمات" : "Products & Services",
    subtitle: fa
      ? "تعریف کالا، قیمت فروش، قیمت خرید، موجودی، بارکد و حداقل موجودی"
      : "Define products, sale price, buy price, inventory, barcode and minimum stock",
    name: fa ? "نام کالا / خدمت" : "Product / Service name",
    code: fa ? "کد کالا" : "Product code",
    barcode: fa ? "بارکد" : "Barcode",
    sku: fa ? "SKU / شناسه داخلی" : "SKU / Internal code",
    brand: fa ? "برند" : "Brand",
    unit: fa ? "واحد" : "Unit",
    buy: fa ? "قیمت خرید" : "Buy price",
    sell: fa ? "قیمت فروش" : "Sell price",
    stock: fa ? "موجودی فعلی" : "Current stock",
    minStock: fa ? "حداقل موجودی هشدار" : "Minimum alert stock",
    mainCategory: fa ? "گروه اصلی" : "Main category",
    subCategory: fa ? "زیرگروه" : "Sub category",
    uploadImage: fa ? "تصویر کالا" : "Product image",
    add: fa ? "ثبت کالا" : "Add product",
    save: fa ? "ذخیره ویرایش" : "Save changes",
    cancel: fa ? "لغو ویرایش" : "Cancel edit",
    search: fa
      ? "جستجوی نام، کد، بارکد، برند یا گروه..."
      : "Search name, code, barcode, brand or category...",
    noData: fa ? "هنوز کالایی ثبت نشده است." : "No product has been created yet.",
    nameRequired: fa ? "نام کالا را وارد کن" : "Enter product name",
  };

  async function saveCache(items) {
    const normalized = Array.isArray(items) ? items.map(normalizeProduct) : [];
    await setCache(PRODUCTS_CACHE_KEY, normalized);
    setProducts(normalized);
  }

  async function load() {
    try {
      setLoading(true);
      setMessage("");
      setOfflineMode(false);

      const cached = await getCache(PRODUCTS_CACHE_KEY);
      const data = await getProducts();

      const merged = mergeServerWithCache(
        Array.isArray(data) ? data : [],
        Array.isArray(cached) ? cached : []
      );

      await saveCache(merged);
    } catch (e) {
      console.error("Products loading error:", e);

      const cached = await getCache(PRODUCTS_CACHE_KEY);

      if (Array.isArray(cached)) {
        setProducts(cached.map(normalizeProduct));
        setOfflineMode(true);
        setMessage(
          fa
            ? "اتصال به سرور برقرار نشد؛ کالاها از حافظه آفلاین نمایش داده شدند."
            : "Server unavailable; products loaded from offline cache."
        );
      } else {
        setMessage(
          fa
            ? "خطا در دریافت کالاها از سرور و کش آفلاین موجود نیست"
            : "Error loading products and no offline cache found"
        );
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [language]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setEditingId(null);
    setForm({ ...empty, unit: fa ? "عدد" : "pcs" });
  }

  function buildPayload() {
    return {
      name: form.name.trim(),
      code: toEnglishDigits(form.code || ""),
      barcode: toEnglishDigits(form.barcode || form.code || form.sku || ""),
      sku: toEnglishDigits(form.sku || ""),
      brand: form.brand || "",
      unit: form.unit || (fa ? "عدد" : "pcs"),
      buy_price: toNumber(form.buy_price),
      purchase_price: toNumber(form.buy_price),
      sell_price: toNumber(form.sell_price),
      price: toNumber(form.sell_price),
      stock: toNumber(form.stock),
      min_stock: toNumber(form.min_stock),
      minimum_stock: toNumber(form.min_stock),
      main_category: form.main_category || "",
      sub_category: form.sub_category || "",
      image: form.image || "",
    };
  }

  async function save() {
    if (!form.name.trim()) {
      alert(label.nameRequired);
      return;
    }

    const payload = buildPayload();

    const optimisticItem = normalizeProduct({
      ...payload,
      id: editingId || Date.now(),
      created_at: new Date().toISOString(),
    });

    try {
      const current = Array.isArray(products) ? [...products] : [];

      const optimisticList = editingId
        ? current.map((item) =>
            String(item.id) === String(editingId)
              ? normalizeProduct({ ...item, ...optimisticItem, id: item.id })
              : item
          )
        : [optimisticItem, ...current];

      await saveCache(optimisticList);

      const result = editingId
        ? await updateProduct(editingId, payload)
        : await createProduct(payload);

      if (result?.status === "error") {
        throw new Error(result.message || (fa ? "خطا در ذخیره کالا" : "Error saving product"));
      }

      const serverItem = normalizeProduct({
        ...optimisticItem,
        ...result,
        id: result?.id || optimisticItem.id,
        buy_price: payload.buy_price,
        min_stock: payload.min_stock,
        unit: payload.unit,
        brand: payload.brand,
        sku: payload.sku,
        main_category: payload.main_category,
        sub_category: payload.sub_category,
        image: payload.image,
      });

      const afterServer = editingId
        ? optimisticList.map((item) =>
            String(item.id) === String(editingId) ? serverItem : item
          )
        : optimisticList.map((item, index) => (index === 0 ? serverItem : item));

      await saveCache(afterServer);

      reset();
      await load();
    } catch (e) {
      console.error("Save product error:", e);

      const current = Array.isArray(products) ? [...products] : [];

      const offlineItem = normalizeProduct({
        ...payload,
        id: editingId || Date.now(),
        pending_sync: true,
        offline_created: !editingId,
        offline_updated_at: new Date().toISOString(),
      });

      const next = editingId
        ? current.map((item) =>
            String(item.id) === String(editingId)
              ? normalizeProduct({ ...item, ...offlineItem, id: item.id })
              : item
          )
        : [offlineItem, ...current];

      await saveCache(next);

      setOfflineMode(true);
      setMessage(
        fa
          ? "سرور در دسترس نبود؛ کالا در حافظه آفلاین ذخیره شد."
          : "Server unavailable; product saved offline."
      );

      reset();
    }
  }

  async function handleDeleteProduct(product) {
    const ok = window.confirm(
      fa
        ? `کالای «${product.name || ""}» حذف شود؟`
        : `Delete "${product.name || ""}"?`
    );
    if (!ok) return;

    try {
      const result = await deleteProduct(product.id);

      if (result?.status === "error") {
        throw new Error(result.message || (fa ? "خطا در حذف کالا" : "Error deleting product"));
      }

      if (String(editingId) === String(product.id)) reset();
      await load();
    } catch (e) {
      console.error("Delete product error:", e);

      const filteredItems = products.filter(
        (item) => String(item.id) !== String(product.id)
      );

      await saveCache(filteredItems);

      if (String(editingId) === String(product.id)) reset();

      setOfflineMode(true);
      setMessage(
        fa
          ? "سرور در دسترس نبود یا حذف آنلاین انجام نشد؛ کالا فقط از حافظه آفلاین حذف شد."
          : "Server unavailable or online delete failed; product removed from offline cache only."
      );
    }
  }

  function edit(product) {
    const item = normalizeProduct(product);

    setEditingId(item.id);
    setForm({
      ...empty,
      ...item,
      code: faText(item.code || item.barcode || "", fa),
      barcode: faText(item.barcode || item.code || "", fa),
      sku: faText(item.sku || "", fa),
      brand: faText(item.brand || "", fa),
      sell_price: toNumber(item.sell_price ?? item.price) === 0 ? "" : faText(item.sell_price ?? item.price, fa),
      buy_price: toNumber(item.buy_price) === 0 ? "" : faText(item.buy_price, fa),
      stock: toNumber(item.stock) === 0 ? "" : faText(item.stock, fa),
      min_stock: toNumber(item.min_stock) === 0 ? "" : faText(item.min_stock, fa),
      unit: item.unit || (fa ? "عدد" : "pcs"),
      main_category: faText(item.main_category || "", fa),
      sub_category: faText(item.sub_category || "", fa),
      image: item.image || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function imageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setField("image", reader.result);
    reader.readAsDataURL(file);
  }

  const filtered = useMemo(() => {
    const q = toEnglishDigits(search).toLowerCase();

    return products.filter((p) =>
      [
        p.name,
        p.code,
        p.barcode,
        p.sku,
        p.brand,
        p.main_category,
        p.sub_category,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [products, search]);

  const totalStock = products.reduce((sum, p) => sum + toNumber(p.stock), 0);

  const lowStock = products.filter(
    (p) => toNumber(p.min_stock) > 0 && toNumber(p.stock) <= toNumber(p.min_stock)
  ).length;

  const stockValue = products.reduce(
    (sum, p) => sum + toNumber(p.stock) * toNumber(p.sell_price ?? p.price),
    0
  );

  return (
    <div className="space-y-6" dir={dir} style={{ direction: dir }}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-black text-cyan-300">{label.title}</h1>
          <p className="text-slate-400 mt-2">{label.subtitle}</p>
        </div>

        <button
          type="button"
          onClick={load}
          className="px-4 py-3 rounded-2xl bg-slate-800 text-cyan-200 font-bold flex items-center gap-2 border border-cyan-500/20"
        >
          <RefreshCw size={18} />
          {fa ? "به‌روزرسانی" : "Refresh"}
        </button>
      </div>

      {message && (
        <div
          className={`rounded-2xl p-4 flex items-center gap-2 ${
            offlineMode
              ? "bg-amber-500/15 border border-amber-400/30 text-amber-100"
              : "bg-red-500/15 border border-red-400/30 text-red-200"
          }`}
        >
          <AlertTriangle size={20} />
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Summary icon={<Package />} title={fa ? "تعداد کالا" : "Products"} value={n(products.length)} />
        <Summary icon={<Boxes />} title={fa ? "موجودی کل" : "Total stock"} value={n(totalStock)} />
        <Summary
          icon={<AlertTriangle />}
          title={fa ? "ارزش موجودی فروش" : "Stock sale value"}
          value={money(stockValue)}
          danger={lowStock > 0}
          subtitle={
            lowStock
              ? fa
                ? `${n(lowStock)} کالا زیر حداقل`
                : `${n(lowStock)} low-stock items`
              : ""
          }
        />
      </div>

      <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Field label={label.name}>
            <input className={inputClass} value={faText(form.name, fa)} onChange={(e) => setField("name", faText(e.target.value, fa))} placeholder={label.name} />
          </Field>

          <Field label={label.code}>
            <input className={inputClass} value={faText(form.code, fa)} onChange={(e) => setField("code", faText(e.target.value, fa))} placeholder={label.code} />
          </Field>

          <Field label={label.barcode}>
            <input className={inputClass} value={faText(form.barcode, fa)} onChange={(e) => setField("barcode", faText(e.target.value, fa))} placeholder={label.barcode} />
          </Field>

          <Field label={label.sku}>
            <input className={inputClass} value={faText(form.sku, fa)} onChange={(e) => setField("sku", faText(e.target.value, fa))} placeholder={label.sku} />
          </Field>

          <Field label={label.brand}>
            <input className={inputClass} value={faText(form.brand, fa)} onChange={(e) => setField("brand", faText(e.target.value, fa))} placeholder={label.brand} />
          </Field>

          <Field label={label.unit}>
            <select
              className={inputClass}
              value={form.unit || (fa ? "عدد" : "pcs")}
              onChange={(e) => setField("unit", e.target.value)}
            >
              {unitOptions.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </Field>

          <Field label={label.buy}>
            <input type="text" inputMode="numeric" className={inputClass} value={form.buy_price} onChange={(e) => setField("buy_price", normalizeNumberInput(e.target.value, fa))} placeholder={fa ? "۰" : "0"} />
          </Field>

          <Field label={label.sell}>
            <input type="text" inputMode="numeric" className={inputClass} value={form.sell_price} onChange={(e) => setField("sell_price", normalizeNumberInput(e.target.value, fa))} placeholder={fa ? "۰" : "0"} />
          </Field>

          <Field label={label.stock}>
            <input type="text" inputMode="numeric" className={inputClass} value={form.stock} onChange={(e) => setField("stock", normalizeNumberInput(e.target.value, fa))} placeholder={fa ? "۰" : "0"} />
          </Field>

          <Field label={label.minStock}>
            <input type="text" inputMode="numeric" className={inputClass} value={form.min_stock} onChange={(e) => setField("min_stock", normalizeNumberInput(e.target.value, fa))} placeholder={fa ? "۰" : "0"} />
          </Field>

          <Field label={label.mainCategory}>
            <input className={inputClass} value={faText(form.main_category, fa)} onChange={(e) => setField("main_category", faText(e.target.value, fa))} placeholder={label.mainCategory} />
          </Field>

          <Field label={label.subCategory}>
            <input className={inputClass} value={faText(form.sub_category, fa)} onChange={(e) => setField("sub_category", faText(e.target.value, fa))} placeholder={label.subCategory} />
          </Field>

          <label className="bg-slate-800 rounded-2xl p-4 outline-none flex items-center gap-2 cursor-pointer border border-cyan-500/10">
            <ImagePlus size={18} />
            {label.uploadImage}
            <input type="file" accept="image/*" onChange={imageChange} className="hidden" />
          </label>
        </div>

        {form.image && (
          <img src={form.image} alt="product" className="mt-4 w-24 h-24 object-cover rounded-2xl border border-cyan-500/30" />
        )}

        <div className="flex gap-3 flex-wrap mt-5">
          <button type="button" onClick={save} className="px-5 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-black flex items-center gap-2">
            {editingId ? <Save size={18} /> : <Plus size={18} />}
            {editingId ? label.save : label.add}
          </button>

          {editingId && (
            <button type="button" onClick={reset} className="px-5 py-3 rounded-2xl bg-slate-700 text-white font-black flex items-center gap-2">
              <X size={18} />
              {label.cancel}
            </button>
          )}
        </div>
      </div>

      <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5">
        <div className="flex items-center gap-2 bg-slate-800 rounded-2xl px-4 py-3 mb-5">
          <Search size={18} />
          <input value={faText(search, fa)} onChange={(e) => setSearch(faText(e.target.value, fa))} placeholder={label.search} className="bg-transparent outline-none w-full text-white placeholder-slate-400" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="text-cyan-300 text-sm border-b border-cyan-500/20">
                <th className="py-3 text-start">{fa ? "کالا" : "Product"}</th>
                <th className="py-3 text-start">{label.barcode}</th>
                <th className="py-3 text-start">{label.buy}</th>
                <th className="py-3 text-start">{label.sell}</th>
                <th className="py-3 text-start">{label.stock}</th>
                <th className="py-3 text-start">{label.minStock}</th>
                <th className="py-3 text-start">{fa ? "عملیات" : "Actions"}</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-6 text-slate-400 text-center">
                    {fa ? "در حال دریافت..." : "Loading..."}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-slate-400 text-center">
                    {label.noData}
                  </td>
                </tr>
              ) : (
                filtered.map((raw) => {
                  const item = normalizeProduct(raw);
                  const isLow = toNumber(item.min_stock) > 0 && toNumber(item.stock) <= toNumber(item.min_stock);

                  return (
                    <tr key={item.id} className="border-t border-slate-800 hover:bg-cyan-500/5">
                      <td className="py-4 flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center overflow-hidden">
                          {item.image ? <img src={item.image} className="w-full h-full object-cover" alt="" /> : <Package size={18} />}
                        </div>

                        <div>
                          <b>
                            {faText(item.name, fa)}
                            {item.pending_sync && <span className="mx-2 text-xs text-amber-300">{fa ? "آفلاین" : "Offline"}</span>}
                          </b>
                          <div className="text-slate-400 text-xs">
                            {faText(item.brand || "-", fa)} • {faText(item.unit || "-", fa)}
                          </div>
                        </div>
                      </td>

                      <td>{faText(item.barcode || item.code || "-", fa)}</td>
                      <td>{money(item.buy_price || 0)}</td>
                      <td>{money(item.sell_price ?? item.price ?? 0)}</td>

                      <td className={isLow ? "text-red-300 font-black" : "text-cyan-200 font-bold"}>
                        {n(item.stock || 0)}
                      </td>

                      <td>{n(item.min_stock || 0)}</td>

                      <td>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button type="button" onClick={() => edit(item)} className="px-3 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 inline-flex items-center gap-2">
                            <Edit3 size={16} />
                            {fa ? "ویرایش" : "Edit"}
                          </button>

                          <button type="button" onClick={() => handleDeleteProduct(item)} className="px-3 py-2 rounded-xl bg-red-500/20 text-red-300 inline-flex items-center gap-2">
                            <Trash2 size={16} />
                            {fa ? "حذف" : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Summary({ icon, title, value, subtitle, danger }) {
  return (
    <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5">
      <div className="flex items-center gap-3 text-cyan-300 mb-3">
        {icon}
        <span className="text-slate-300 font-bold">{title}</span>
      </div>

      <div className={`text-3xl font-black ${danger ? "text-red-300" : "text-cyan-300"}`}>
        {value}
      </div>

      {subtitle && <div className="text-xs text-amber-300 mt-2">{subtitle}</div>}
    </div>
  );
}