import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Archive, ArchiveRestore, BookOpen, Copy, FileDown, MessageCircle, Pencil, Plus, QrCode, Send, ShieldOff, Sparkles, X } from "lucide-react";
import toast from "react-hot-toast";
import QRCodeLib from "qrcode";

import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits } from "../localization/helpers";
import Modal from "../components/ui/Modal";
import {
  archiveCatalogLink,
  createCatalogLink,
  downloadAuthenticatedFile,
  duplicateCatalogLink,
  getBranches,
  getCatalogLinks,
  getCatalogMessages,
  getCatalogOrders,
  getCustomers,
  getProducts,
  markCatalogOrderConverted,
  reactivateCatalogLink,
  rejectCatalogOrder,
  revokeCatalogLink,
  unarchiveCatalogLink,
  updateCatalogLink,
} from "../services/api";

const CATALOG_TYPES = ["product_catalog", "price_list", "promotional", "wholesale", "customer_specific", "branch_specific"];
const PRICE_SOURCES = ["base", "pricing_rule", "customer_specific"];

const emptyEditDraft = {
  title: "", main_category: null, in_stock_only: true, product_ids: null, catalog_type: "product_catalog",
  branch_id: "", language: "fa", currency: "", valid_from: "", valid_until: "", customer_id: "",
  price_source: "base", show_stock_status: true, enabled: true,
};

const cardClass = "rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-panel)] p-5";
const inputClass = "w-full mb-3 p-3 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] outline-none focus:ring-2 focus:ring-cyan-400";
const buttonClass = "rounded-xl bg-[var(--erp-accent)] text-black font-black px-4 py-3 disabled:opacity-60 flex items-center gap-2";

const WHATSAPP_NUMBER = (import.meta.env.VITE_WHATSAPP_BUSINESS_NUMBER || "").replace(/\D/g, "");
const TELEGRAM_BOT = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME || "").replace(/^@/, "");

function orderMessageTemplate(catalog, language) {
  const url = `${window.location.origin}/catalog/${catalog.token}`;
  return language === "fa"
    ? `کاتالوگ «${catalog.title}» را ببینید: ${url}\n\nبرای سفارش از طریق همین گفتگو، این پیام را با کد کالا و تعداد ویرایش کرده و ارسال کنید:\nORDER ${catalog.id}\n2x <کد کالا>\n1x <کد کالا>`
    : language === "ar"
    ? `تصفّح كتالوج "${catalog.title}": ${url}\n\nللطلب مباشرة من هذه المحادثة، عدّل هذه الرسالة برموز المنتجات والكميات وأرسلها:\nORDER ${catalog.id}\n2x <رمز المنتج>\n1x <رمز المنتج>`
    : language === "tr"
    ? `"${catalog.title}" kataloğuna göz atın: ${url}\n\nBu sohbetten sipariş vermek için, bu mesajı ürün kodları ve miktarlarla düzenleyip gönderin:\nORDER ${catalog.id}\n2x <ürün kodu>\n1x <ürün kodu>`
    : `Browse the "${catalog.title}" catalog: ${url}\n\nTo order right from this chat, edit this message with product codes and quantities and send it:\nORDER ${catalog.id}\n2x <product code>\n1x <product code>`;
}

function whatsappShareUrl(catalog, language) {
  const text = encodeURIComponent(orderMessageTemplate(catalog, language));
  return WHATSAPP_NUMBER ? `https://wa.me/${WHATSAPP_NUMBER}?text=${text}` : `https://wa.me/?text=${text}`;
}

function telegramShareUrl(catalog, language) {
  const text = encodeURIComponent(orderMessageTemplate(catalog, language));
  if (TELEGRAM_BOT) return `https://t.me/${TELEGRAM_BOT}?text=${text}`;
  const url = encodeURIComponent(`${window.location.origin}/catalog/${catalog.token}`);
  return `https://t.me/share/url?url=${url}&text=${text}`;
}

function CatalogQrModal({ catalog, language, onClose }) {
  const [dataUrl, setDataUrl] = useState("");
  const url = `${window.location.origin}/catalog/${catalog.token}`;

  useEffect(() => {
    let active = true;
    QRCodeLib.toDataURL(url, { margin: 1, width: 280 })
      .then((generated) => { if (active) setDataUrl(generated); })
      .catch(() => { if (active) setDataUrl(""); });
    return () => { active = false; };
  }, [url]);

  return (
    <Modal open onClose={onClose} maxWidthClassName="max-w-sm" className="p-6 text-center" labelledBy="catalog-qr-title">
        <div className="flex items-center justify-between mb-4">
          <h3 id="catalog-qr-title" className="font-black" style={{ color: "var(--erp-accent)" }}>{catalog.title}</h3>
          <button onClick={onClose} className="text-[var(--erp-muted)]"><X size={20} /></button>
        </div>
        {dataUrl ? (
          <img src={dataUrl} alt="QR" className="mx-auto rounded-2xl bg-white p-3" />
        ) : (
          <div className="h-[280px] flex items-center justify-center text-[var(--erp-muted)]">...</div>
        )}
        <p className="text-xs text-[var(--erp-muted)] mt-4">
          {language === "fa"
            ? "این کد QR را در استوری، تراکت یا ویترین بگذارید؛ با اسکن آن مشتری مستقیم به کاتالوگ می‌رسد."
            : language === "ar"
            ? "ضع رمز QR هذا على القصة أو المنشور أو الواجهة؛ عند مسحه يصل العميل مباشرة إلى الكتالوج."
            : language === "tr"
            ? "Bu QR kodunu hikayeye, broşüre veya vitrine koyun; taratıldığında müşteri doğrudan kataloğa ulaşır."
            : "Put this QR code on a story, flyer, or storefront - scanning it takes the customer straight to the catalog."}
        </p>
        {dataUrl && (
          <a
            href={dataUrl}
            download={`catalog-qr-${catalog.id}.png`}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold"
            style={{ background: "var(--erp-accent)", color: "#071028" }}
          >
            <FileDown size={16} />
            {language === "fa" ? "دانلود تصویر QR" : language === "ar" ? "تنزيل صورة QR" : language === "tr" ? "QR görselini indir" : "Download QR image"}
          </a>
        )}
    </Modal>
  );
}

export default function CatalogManager() {
  const { dir, language, money, n } = useLanguage();
  const tr = (fa, ar, trText, en) => (language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? trText : en);

  const [products, setProducts] = useState([]);
  const [catalogs, setCatalogs] = useState([]);
  const [branches, setBranches] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [qrCatalog, setQrCatalog] = useState(null);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState("category"); // "category" | "custom"
  const [category, setCategory] = useState("");
  const [inStockOnly, setInStockOnly] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState("");

  const [listSearch, setListSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(emptyEditDraft);
  const [savingEdit, setSavingEdit] = useState(false);

  const catalogTypeLabel = (t) => ({
    product_catalog: tr("کاتالوگ محصول", "كتالوج المنتجات", "Ürün kataloğu", "Product catalog"),
    price_list: tr("لیست قیمت", "قائمة الأسعار", "Fiyat listesi", "Price list"),
    promotional: tr("کاتالوگ تبلیغاتی", "كتالوج ترويجي", "Promosyon kataloğu", "Promotional catalog"),
    wholesale: tr("کاتالوگ عمده‌فروشی", "كتالوج جملة", "Toptan katalog", "Wholesale catalog"),
    customer_specific: tr("کاتالوگ اختصاصی مشتری", "كتالوج خاص بالعميل", "Müşteriye özel katalog", "Customer-specific catalog"),
    branch_specific: tr("کاتالوگ اختصاصی شعبه", "كتالوج خاص بالفرع", "Şubeye özel katalog", "Branch-specific catalog"),
  }[t] || t);

  const priceSourceLabel = (s) => ({
    base: tr("قیمت پایه کالا", "السعر الأساسي", "Taban fiyat", "Base product price"),
    pricing_rule: tr("نتیجه قوانین قیمت‌گذاری", "نتيجة قواعد التسعير", "Fiyatlandırma kuralı sonucu", "Pricing rule result"),
    customer_specific: tr("قیمت اختصاصی مشتری", "سعر خاص بالعميل", "Müşteriye özel fiyat", "Customer-specific price"),
  }[s] || s);

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.main_category).filter(Boolean));
    return Array.from(set);
  }, [products]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((p) => (p.name || "").toLowerCase().includes(term));
  }, [products, search]);

  async function loadAll() {
    setLoading(true);
    try {
      const params = {};
      if (listSearch.trim()) params.search = listSearch.trim();
      if (typeFilter) params.catalog_type = typeFilter;
      if (statusFilter) params.status = statusFilter;
      const [productsData, catalogsData, ordersData, messagesData, branchesData, customersData] = await Promise.all([
        getProducts(),
        getCatalogLinks(params),
        getCatalogOrders(),
        getCatalogMessages(),
        getBranches(),
        getCustomers(),
      ]);
      setProducts(Array.isArray(productsData) ? productsData : []);
      setCatalogs(catalogsData.items || []);
      setOrders(ordersData.items || []);
      setMessages(messagesData.items || []);
      setBranches(branchesData.items || []);
      setCustomers(Array.isArray(customersData) ? customersData : []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void loadAll(); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => { void loadAll(); }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listSearch]);

  function openEdit(catalog) {
    setEditingId(catalog.id);
    setEditDraft({
      ...emptyEditDraft, ...catalog,
      branch_id: catalog.branch_id ?? "", customer_id: catalog.customer_id ?? "",
      valid_from: catalog.valid_from || "", valid_until: catalog.valid_until || "",
    });
  }

  async function handleSaveEdit(event) {
    event.preventDefault();
    if (editDraft.price_source === "customer_specific" && !editDraft.customer_id) {
      toast.error(tr("برای قیمت اختصاصی مشتری، مشتری را انتخاب کنید.", "اختر عميلاً للسعر الخاص بالعميل.", "Müşteriye özel fiyat için müşteri seçin.", "Select a customer for customer-specific pricing."));
      return;
    }
    setSavingEdit(true);
    try {
      await updateCatalogLink(editingId, {
        ...editDraft,
        branch_id: editDraft.branch_id === "" ? null : Number(editDraft.branch_id),
        customer_id: editDraft.customer_id === "" ? null : Number(editDraft.customer_id),
        valid_from: editDraft.valid_from || null,
        valid_until: editDraft.valid_until || null,
      });
      toast.success(tr("کاتالوگ ذخیره شد.", "تم حفظ الكتالوج.", "Katalog kaydedildi.", "Catalog saved."));
      setEditingId(null);
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDuplicate(id) {
    try {
      await duplicateCatalogLink(id);
      toast.success(tr("کپی کاتالوگ ساخته شد.", "تم إنشاء نسخة من الكتالوج.", "Katalog kopyalandı.", "Catalog duplicated."));
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleArchive(id) {
    try {
      await archiveCatalogLink(id);
      toast.success(tr("کاتالوگ آرشیو شد.", "تمت أرشفة الكتالوج.", "Katalog arşivlendi.", "Catalog archived."));
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleUnarchive(id) {
    try {
      await unarchiveCatalogLink(id);
      toast.success(tr("کاتالوگ از آرشیو خارج شد.", "تم إلغاء أرشفة الكتالوج.", "Katalog arşivden çıkarıldı.", "Catalog restored from archive."));
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (!title.trim()) {
      toast.error(language === "fa" ? "عنوان کاتالوگ را وارد کنید." : language === "ar" ? "أدخل عنوان الكتالوج." : language === "tr" ? "Katalog başlığını girin." : "Enter a catalog title.");
      return;
    }
    if (mode === "custom" && selectedIds.length === 0) {
      toast.error(language === "fa" ? "حداقل یک کالا انتخاب کنید." : language === "ar" ? "اختر منتجًا واحدًا على الأقل." : language === "tr" ? "En az bir ürün seçin." : "Select at least one product.");
      return;
    }
    setCreating(true);
    try {
      await createCatalogLink({
        title: title.trim(),
        main_category: mode === "category" ? (category || null) : null,
        // A hand-picked selection is already deliberate curation - don't let
        // "in-stock only" silently drop an item staff explicitly chose.
        in_stock_only: mode === "category" ? inStockOnly : false,
        product_ids: mode === "custom" ? selectedIds : null,
      });
      toast.success(language === "fa" ? "کاتالوگ ساخته شد." : language === "ar" ? "تم إنشاء الكتالوج." : language === "tr" ? "Katalog oluşturuldu." : "Catalog created.");
      setTitle("");
      setSelectedIds([]);
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function copyLink(token) {
    if (!token) return;
    const url = `${window.location.origin}/catalog/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(language === "fa" ? "لینک کپی شد." : language === "ar" ? "تم نسخ الرابط." : language === "tr" ? "Bağlantı kopyalandı." : "Link copied.");
    } catch {
      toast.error(language === "fa" ? "کپی خودکار ممکن نشد." : language === "ar" ? "تعذّر النسخ تلقائيًا." : language === "tr" ? "Otomatik kopyalama başarısız oldu." : "Couldn't copy automatically.");
    }
  }

  async function handleRevoke(id) {
    try {
      await revokeCatalogLink(id);
      toast.success(language === "fa" ? "کاتالوگ غیرفعال شد." : language === "ar" ? "تم تعطيل الكتالوج." : language === "tr" ? "Katalog devre dışı bırakıldı." : "Catalog disabled.");
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleReactivate(id) {
    try {
      await reactivateCatalogLink(id);
      toast.success(language === "fa" ? "کاتالوگ دوباره فعال شد." : language === "ar" ? "تم إعادة تفعيل الكتالوج." : language === "tr" ? "Katalog yeniden etkinleştirildi." : "Catalog reactivated.");
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function downloadPdf(id, catalogTitle, orientation = "portrait") {
    try {
      await downloadAuthenticatedFile(`/api/catalog/links/${id}/pdf?language=${language}&orientation=${orientation}`, `${catalogTitle || "catalog"}.pdf`);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleConvert(id) {
    try {
      const result = await markCatalogOrderConverted(id);
      if (result?.status === "error") throw new Error(result.message);
      toast.success(language === "fa" ? "فاکتور واقعی ساخته شد." : language === "ar" ? "تم إنشاء فاتورة فعلية." : language === "tr" ? "Gerçek bir fatura oluşturuldu." : "A real invoice was created.");
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleReject(id) {
    try {
      await rejectCatalogOrder(id);
      toast.success(language === "fa" ? "سفارش رد شد." : language === "ar" ? "تم رفض الطلب." : language === "tr" ? "Sipariş reddedildi." : "Order rejected.");
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div dir={dir} className="p-4 md:p-6 space-y-6 text-[var(--erp-text)]">
      <h1 className="text-2xl font-black flex items-center gap-2">
        <BookOpen className="text-[var(--erp-accent)]" />
        {language === "fa" ? "کاتالوگ دیجیتال و چاپی" : language === "ar" ? "الكتالوج الرقمي والمطبوع" : language === "tr" ? "Dijital ve basılı katalog" : "Digital & print catalog"}
      </h1>

      <section className={cardClass}>
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Plus size={18} /> {language === "fa" ? "ساخت کاتالوگ جدید" : language === "ar" ? "إنشاء كتالوج جديد" : language === "tr" ? "Yeni katalog oluştur" : "Create a new catalog"}
        </h2>
        <form onSubmit={handleCreate}>
          <input
            className={inputClass}
            placeholder={language === "fa" ? "عنوان کاتالوگ (مثلاً «مجموعه تابستانی»)" : language === "ar" ? "عنوان الكتالوج (مثلاً «تشكيلة الصيف»)" : language === "tr" ? "Katalog başlığı (örn. \"Yaz koleksiyonu\")" : "Catalog title (e.g. \"Summer collection\")"}
            value={title}
            onChange={(e) => setTitle(language === "fa" ? toPersianDigits(e.target.value) : e.target.value)}
          />

          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setMode("category")}
              className={`flex-1 rounded-xl py-2 font-bold ${mode === "category" ? "bg-[var(--erp-accent)] text-black" : "bg-[var(--erp-panel-solid)] text-[var(--erp-muted)]"}`}
            >
              {language === "fa" ? "بر اساس گروه کالایی" : language === "ar" ? "حسب التصنيف" : language === "tr" ? "Kategoriye göre" : "By category"}
            </button>
            <button
              type="button"
              onClick={() => setMode("custom")}
              className={`flex-1 rounded-xl py-2 font-bold ${mode === "custom" ? "bg-[var(--erp-accent)] text-black" : "bg-[var(--erp-panel-solid)] text-[var(--erp-muted)]"}`}
            >
              {language === "fa" ? "انتخاب دلخواه کالا" : language === "ar" ? "اختيار مخصص للمنتجات" : language === "tr" ? "Özel ürün seçimi" : "Custom selection"}
            </button>
          </div>

          {mode === "category" ? (
            <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">{language === "fa" ? "همه گروه‌ها" : language === "ar" ? "كل التصنيفات" : language === "tr" ? "Tüm kategoriler" : "All categories"}</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          ) : (
            <div className="mb-3">
              <input
                className={inputClass}
                placeholder={language === "fa" ? "جستجوی کالا..." : language === "ar" ? "بحث عن منتجات..." : language === "tr" ? "Ürün ara..." : "Search products..."}
                value={search}
                onChange={(e) => setSearch(language === "fa" ? toPersianDigits(e.target.value) : e.target.value)}
              />
              <div className="max-h-48 overflow-auto space-y-1 rounded-xl bg-[var(--erp-panel-solid)] p-2">
                {filteredProducts.map((product) => (
                  <label key={product.id} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(product.id)}
                      onChange={(e) => {
                        setSelectedIds((current) =>
                          e.target.checked ? [...current, product.id] : current.filter((id) => id !== product.id)
                        );
                      }}
                    />
                    <span className="text-sm">{product.name}</span>
                    <span className="text-xs text-[var(--erp-muted)] ms-auto">{money(product.sell_price || product.price || 0)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {mode === "category" && (
            <label className="flex items-center gap-2 mb-4 text-sm text-[var(--erp-muted)]">
              <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} />
              {language === "fa" ? "فقط کالاهای موجود" : language === "ar" ? "المنتجات المتوفرة فقط" : language === "tr" ? "Yalnızca stoktaki ürünler" : "In-stock products only"}
            </label>
          )}

          <button type="submit" disabled={creating} className={buttonClass}>
            <Sparkles size={16} />
            {creating
              ? (language === "fa" ? "در حال ساخت..." : language === "ar" ? "جارٍ الإنشاء..." : language === "tr" ? "Oluşturuluyor..." : "Creating...")
              : (language === "fa" ? "ساخت کاتالوگ" : language === "ar" ? "إنشاء الكتالوج" : language === "tr" ? "Katalog oluştur" : "Create catalog")}
          </button>
        </form>
      </section>

      <section className={cardClass}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h2 className="text-lg font-bold">{language === "fa" ? "کاتالوگ‌های ساخته‌شده" : language === "ar" ? "كتالوجاتك" : language === "tr" ? "Kataloglarınız" : "Your catalogs"}</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <input className={inputClass + " mb-0"} placeholder={tr("جستجوی عنوان...", "بحث بالعنوان...", "Başlığa göre ara...", "Search by title...")} value={listSearch} onChange={(e) => setListSearch(e.target.value)} />
          <select className={inputClass + " mb-0"} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">{tr("همه انواع", "كل الأنواع", "Tüm türler", "All types")}</option>
            {CATALOG_TYPES.map((t) => <option key={t} value={t}>{catalogTypeLabel(t)}</option>)}
          </select>
          <select className={inputClass + " mb-0"} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="active">{tr("فعال", "نشط", "Aktif", "Active")}</option>
            <option value="archived">{tr("آرشیوشده", "مؤرشف", "Arşivlenmiş", "Archived")}</option>
            <option value="all">{tr("همه", "الكل", "Tümü", "All")}</option>
          </select>
        </div>
        {loading ? (
          <p className="text-[var(--erp-muted)]">{language === "fa" ? "در حال بارگذاری..." : language === "ar" ? "جارٍ التحميل..." : language === "tr" ? "Yükleniyor..." : "Loading..."}</p>
        ) : catalogs.length === 0 ? (
          <p className="text-[var(--erp-muted)]">{language === "fa" ? "هنوز کاتالوگی نساخته‌اید." : language === "ar" ? "لا توجد كتالوجات بعد." : language === "tr" ? "Henüz katalog yok." : "No catalogs yet."}</p>
        ) : (
          <div className="space-y-3">
            {catalogs.map((catalog, index) => (
              <div key={catalog.id} className="rounded-xl bg-[var(--erp-panel-solid)] p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="text-[var(--erp-muted)] font-bold text-sm mt-0.5">{n(index + 1)}</span>
                  <div>
                    <div className="font-bold">{catalog.title}</div>
                    <div className="text-xs text-[var(--erp-muted)]">
                      {catalogTypeLabel(catalog.catalog_type)} • {n(catalog.product_count)} {language === "fa" ? "کالا" : language === "ar" ? "منتج" : language === "tr" ? "ürün" : "products"} •{" "}
                      {catalog.archived
                        ? tr("آرشیوشده", "مؤرشف", "Arşivlenmiş", "Archived")
                        : catalog.enabled
                        ? (language === "fa" ? "فعال" : language === "ar" ? "نشط" : language === "tr" ? "Aktif" : "Active")
                        : (language === "fa" ? "غیرفعال" : language === "ar" ? "معطّل" : language === "tr" ? "Devre dışı" : "Disabled")}
                      {" • "}{tr("بازدید", "مشاهدات", "Görüntülenme", "Views")}: {n(catalog.view_count || 0)} • {tr("سفارش", "طلبات", "Sipariş", "Orders")}: {n(catalog.order_count || 0)}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => openEdit(catalog)} className="px-3 py-2 rounded-xl bg-[var(--erp-glow)] text-[var(--erp-accent)] text-sm font-bold flex items-center gap-1">
                    <Pencil size={14} /> {tr("ویرایش", "تعديل", "Düzenle", "Edit")}
                  </button>
                  <button onClick={() => handleDuplicate(catalog.id)} className="px-3 py-2 rounded-xl bg-violet-500/20 text-violet-200 text-sm font-bold flex items-center gap-1">
                    <Copy size={14} /> {tr("کپی", "نسخ", "Kopyala", "Duplicate")}
                  </button>
                  {catalog.enabled && !catalog.archived && (
                    <button onClick={() => copyLink(catalog.token)} className="px-3 py-2 rounded-xl bg-indigo-500/20 text-indigo-200 text-sm font-bold flex items-center gap-1">
                      <Copy size={14} /> {language === "fa" ? "کپی لینک" : language === "ar" ? "نسخ الرابط" : language === "tr" ? "Bağlantıyı kopyala" : "Copy link"}
                    </button>
                  )}
                  {catalog.enabled && !catalog.archived && (
                    <button onClick={() => setQrCatalog(catalog)} className="px-3 py-2 rounded-xl bg-fuchsia-500/20 text-fuchsia-200 text-sm font-bold flex items-center gap-1">
                      <QrCode size={14} /> QR
                    </button>
                  )}
                  {catalog.enabled && !catalog.archived && (
                    <a
                      href={whatsappShareUrl(catalog, language)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-200 text-sm font-bold flex items-center gap-1"
                    >
                      <MessageCircle size={14} /> WhatsApp
                    </a>
                  )}
                  {catalog.enabled && !catalog.archived && (
                    <a
                      href={telegramShareUrl(catalog, language)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 rounded-xl bg-sky-500/20 text-sky-200 text-sm font-bold flex items-center gap-1"
                    >
                      <Send size={14} /> Telegram
                    </a>
                  )}
                  <button onClick={() => downloadPdf(catalog.id, catalog.title, "portrait")} className="px-3 py-2 rounded-xl bg-[var(--erp-glow)] text-[var(--erp-accent)] text-sm font-bold flex items-center gap-1">
                    <FileDown size={14} /> PDF
                  </button>
                  <button onClick={() => downloadPdf(catalog.id, catalog.title, "landscape")} className="px-3 py-2 rounded-xl bg-[var(--erp-glow)] text-[var(--erp-accent)] text-sm font-bold flex items-center gap-1">
                    <FileDown size={14} /> PDF {tr("افقی", "أفقي", "Yatay", "Landscape")}
                  </button>
                  {!catalog.archived && (catalog.enabled ? (
                    <button onClick={() => handleRevoke(catalog.id)} className="px-3 py-2 rounded-xl bg-red-500/15 text-red-200 text-sm font-bold flex items-center gap-1">
                      <ShieldOff size={14} /> {language === "fa" ? "غیرفعال" : language === "ar" ? "تعطيل" : language === "tr" ? "Devre dışı bırak" : "Disable"}
                    </button>
                  ) : (
                    <button onClick={() => handleReactivate(catalog.id)} className="px-3 py-2 rounded-xl bg-emerald-500/15 text-emerald-200 text-sm font-bold">
                      {language === "fa" ? "فعال‌سازی" : language === "ar" ? "إعادة التفعيل" : language === "tr" ? "Yeniden etkinleştir" : "Reactivate"}
                    </button>
                  ))}
                  {catalog.archived ? (
                    <button onClick={() => handleUnarchive(catalog.id)} className="px-3 py-2 rounded-xl bg-emerald-500/15 text-emerald-200 text-sm font-bold flex items-center gap-1">
                      <ArchiveRestore size={14} /> {tr("خروج از آرشیو", "إلغاء الأرشفة", "Arşivden çıkar", "Unarchive")}
                    </button>
                  ) : (
                    <button onClick={() => handleArchive(catalog.id)} className="px-3 py-2 rounded-xl bg-[var(--erp-panel)] text-[var(--erp-muted)] text-sm font-bold flex items-center gap-1">
                      <Archive size={14} /> {tr("آرشیو", "أرشفة", "Arşivle", "Archive")}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal open={!!editingId} onClose={() => setEditingId(null)} maxWidthClassName="max-w-2xl" labelledBy="catalog-edit-title">
        <form onSubmit={handleSaveEdit} className="p-5 space-y-3">
          <h2 id="catalog-edit-title" className="text-lg font-bold mb-2">{tr("ویرایش کاتالوگ", "تعديل الكتالوج", "Kataloğu düzenle", "Edit catalog")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input className={inputClass} placeholder={tr("عنوان", "العنوان", "Başlık", "Title")} value={editDraft.title} onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })} />
            <select className={inputClass} value={editDraft.catalog_type} onChange={(e) => setEditDraft({ ...editDraft, catalog_type: e.target.value })}>
              {CATALOG_TYPES.map((t) => <option key={t} value={t}>{catalogTypeLabel(t)}</option>)}
            </select>
            <select className={inputClass} value={editDraft.branch_id} onChange={(e) => setEditDraft({ ...editDraft, branch_id: e.target.value })}>
              <option value="">{tr("بدون شعبه خاص", "بدون فرع محدد", "Belirli şube yok", "No specific branch")}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select className={inputClass} value={editDraft.language} onChange={(e) => setEditDraft({ ...editDraft, language: e.target.value })}>
              {["fa", "ar", "tr", "en"].map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
            </select>
            <input className={inputClass} placeholder={tr("واحد پول (مثلاً IRR)", "العملة", "Para birimi", "Currency")} value={editDraft.currency} onChange={(e) => setEditDraft({ ...editDraft, currency: e.target.value })} />
            <select className={inputClass} value={editDraft.price_source} onChange={(e) => setEditDraft({ ...editDraft, price_source: e.target.value })}>
              {PRICE_SOURCES.map((s) => <option key={s} value={s}>{priceSourceLabel(s)}</option>)}
            </select>
            {editDraft.price_source === "customer_specific" && (
              <select className={inputClass} value={editDraft.customer_id} onChange={(e) => setEditDraft({ ...editDraft, customer_id: e.target.value })}>
                <option value="">{tr("انتخاب مشتری...", "اختر عميلاً...", "Müşteri seçin...", "Select customer...")}</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <label className="text-sm">
              <span className="block mb-1 text-[var(--erp-muted)]">{tr("معتبر از", "صالح من", "Geçerlilik başlangıcı", "Valid from")}</span>
              <input type="date" className={inputClass} value={editDraft.valid_from} onChange={(e) => setEditDraft({ ...editDraft, valid_from: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="block mb-1 text-[var(--erp-muted)]">{tr("معتبر تا", "صالح حتى", "Geçerlilik bitişi", "Valid until")}</span>
              <input type="date" className={inputClass} value={editDraft.valid_until} onChange={(e) => setEditDraft({ ...editDraft, valid_until: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editDraft.show_stock_status} onChange={(e) => setEditDraft({ ...editDraft, show_stock_status: e.target.checked })} />
              {tr("نمایش وضعیت موجودی به مشتری", "عرض حالة المخزون للعميل", "Müşteriye stok durumunu göster", "Show stock status to customer")}
            </label>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditingId(null)} className="px-4 py-3 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)]">
              {tr("انصراف", "إلغاء", "İptal", "Cancel")}
            </button>
            <button type="submit" disabled={savingEdit} className={buttonClass}>
              {savingEdit ? tr("در حال ذخیره...", "جارٍ الحفظ...", "Kaydediliyor...", "Saving...") : tr("ذخیره", "حفظ", "Kaydet", "Save")}
            </button>
          </div>
        </form>
      </Modal>

      <section className={cardClass}>
        <h2 className="text-lg font-bold mb-4">{language === "fa" ? "سفارش‌های دریافتی از کاتالوگ" : language === "ar" ? "طلبات الكتالوج" : language === "tr" ? "Katalog siparişleri" : "Catalog orders"}</h2>
        {orders.length === 0 ? (
          <p className="text-[var(--erp-muted)]">{language === "fa" ? "سفارشی دریافت نشده است." : language === "ar" ? "لا توجد طلبات بعد." : language === "tr" ? "Henüz sipariş yok." : "No orders yet."}</p>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div key={order.id} className="rounded-xl bg-[var(--erp-panel-solid)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-bold">{order.customer_name}</div>
                    <div className="text-xs text-[var(--erp-muted)]">{order.customer_phone}</div>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded-lg bg-[var(--erp-panel-solid)]">
                    {
                      {
                        pending: language === "fa" ? "در انتظار" : language === "ar" ? "قيد الانتظار" : language === "tr" ? "Beklemede" : "Pending",
                        converted: language === "fa" ? "تبدیل شده" : language === "ar" ? "تم التحويل" : language === "tr" ? "Dönüştürüldü" : "Converted",
                        rejected: language === "fa" ? "رد شده" : language === "ar" ? "مرفوض" : language === "tr" ? "Reddedildi" : "Rejected",
                      }[order.status] || order.status
                    }
                  </span>
                </div>
                <ul className="text-sm text-[var(--erp-muted)] mt-2 list-disc ps-5">
                  {order.items.map((item, index) => (
                    <li key={index}>{item.name} × {item.quantity}</li>
                  ))}
                </ul>
                {order.status === "pending" && (
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => handleConvert(order.id)} className="px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-200 text-sm font-bold">
                      {language === "fa" ? "تبدیل به فاکتور" : language === "ar" ? "وضع علامة كمحوَّل" : language === "tr" ? "Dönüştürüldü işaretle" : "Mark converted"}
                    </button>
                    <button onClick={() => handleReject(order.id)} className="px-3 py-2 rounded-xl bg-red-500/15 text-red-200 text-sm font-bold">
                      {language === "fa" ? "رد کردن" : language === "ar" ? "رفض" : language === "tr" ? "Reddet" : "Reject"}
                    </button>
                  </div>
                )}
                {order.status === "converted" && order.converted_invoice_id && (
                  <Link to={`/invoice-print/${order.converted_invoice_id}`} className="inline-block mt-3 px-3 py-2 rounded-xl bg-[var(--erp-glow)] text-[var(--erp-accent)] text-sm font-bold">
                    {language === "fa" ? `مشاهده فاکتور #${order.converted_invoice_id}` : language === "ar" ? `عرض الفاتورة #${order.converted_invoice_id}` : language === "tr" ? `Faturayı görüntüle #${order.converted_invoice_id}` : `View invoice #${order.converted_invoice_id}`}
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={cardClass}>
        <h2 className="text-lg font-bold mb-2">{language === "fa" ? "گزارش سفارش‌های چت (واتساپ/تلگرام)" : language === "ar" ? "سجل طلبات الدردشة (واتساب/تيليجرام)" : language === "tr" ? "Sohbet sipariş günlüğü (WhatsApp/Telegram)" : "Chat order log (WhatsApp/Telegram)"}</h2>
        <p className="text-sm text-[var(--erp-muted)] mb-4">
          {language === "fa"
            ? "مشتریان می‌توانند با ارسال پیام «ORDER» به شماره واتساپ یا ربات تلگرام کسب‌وکار شما، مستقیماً سفارش ثبت کنند. هر پیام دریافتی این‌جا ثبت می‌شود، چه سفارش ساخته شود چه نه."
            : language === "ar"
            ? "يمكن للعملاء تقديم طلب عبر إرسال رسالة \"ORDER\" إلى رقم واتساب أو بوت تيليجرام الخاص بعملك. يتم تسجيل كل رسالة واردة هنا، سواء تحوّلت إلى طلب أم لا."
            : language === "tr"
            ? "Müşteriler, işletmenizin WhatsApp numarasına veya Telegram botuna \"ORDER\" mesajı göndererek sipariş verebilir. Sipariş olup olmadığına bakılmaksızın gelen her mesaj burada kaydedilir."
            : "Customers can place an order by texting an \"ORDER\" message to your business WhatsApp number or Telegram bot. Every inbound message is logged here, whether or not it turned into an order."}
        </p>
        {messages.length === 0 ? (
          <p className="text-[var(--erp-muted)]">{language === "fa" ? "هنوز پیامی دریافت نشده است." : language === "ar" ? "لم يتم استلام أي رسائل بعد." : language === "tr" ? "Henüz sohbet mesajı alınmadı." : "No chat messages received yet."}</p>
        ) : (
          <div className="space-y-2">
            {messages.map((m) => (
              <div key={m.id} className="rounded-xl bg-[var(--erp-panel-solid)] p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <span className="font-bold uppercase text-xs px-2 py-1 rounded-lg bg-[var(--erp-panel-solid)] me-2">{m.source}</span>
                  <span className="text-[var(--erp-muted)]">{m.sender_reference}</span>
                  {m.detail && <span className="text-[var(--erp-muted)] ms-2">— {m.detail}</span>}
                </div>
                <span
                  className={`text-xs font-bold px-2 py-1 rounded-lg ${
                    m.status === "created"
                      ? "bg-emerald-500/20 text-emerald-200"
                      : m.status === "rejected"
                      ? "bg-red-500/15 text-red-200"
                      : "bg-[var(--erp-panel-solid)] text-[var(--erp-muted)]"
                  }`}
                >
                  {
                    {
                      created: language === "fa" ? "ثبت شد" : language === "ar" ? "تم الإنشاء" : language === "tr" ? "Oluşturuldu" : "Created",
                      rejected: language === "fa" ? "رد شد" : language === "ar" ? "مرفوض" : language === "tr" ? "Reddedildi" : "Rejected",
                    }[m.status] || (language === "fa" ? "در انتظار" : language === "ar" ? "قيد الانتظار" : language === "tr" ? "Beklemede" : "Pending")
                  }
                  {m.catalog_order_id ? ` #${n(m.catalog_order_id)}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {qrCatalog && <CatalogQrModal catalog={qrCatalog} language={language} onClose={() => setQrCatalog(null)} />}
    </div>
  );
}
