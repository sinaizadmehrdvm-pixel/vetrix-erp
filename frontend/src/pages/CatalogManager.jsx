import { useEffect, useMemo, useState } from "react";
import { BookOpen, Copy, FileDown, MessageCircle, Plus, Send, ShieldOff, Sparkles } from "lucide-react";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits } from "../localization/helpers";
import {
  createCatalogLink,
  downloadAuthenticatedFile,
  getCatalogLinks,
  getCatalogMessages,
  getCatalogOrders,
  getProducts,
  markCatalogOrderConverted,
  reactivateCatalogLink,
  rejectCatalogOrder,
  revokeCatalogLink,
} from "../services/api";

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

export default function CatalogManager() {
  const { dir, language, money, n } = useLanguage();

  const [products, setProducts] = useState([]);
  const [catalogs, setCatalogs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [title, setTitle] = useState("");
  const [mode, setMode] = useState("category"); // "category" | "custom"
  const [category, setCategory] = useState("");
  const [inStockOnly, setInStockOnly] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState("");

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
      const [productsData, catalogsData, ordersData, messagesData] = await Promise.all([
        getProducts(),
        getCatalogLinks(),
        getCatalogOrders(),
        getCatalogMessages(),
      ]);
      setProducts(Array.isArray(productsData) ? productsData : []);
      setCatalogs(catalogsData.items || []);
      setOrders(ordersData.items || []);
      setMessages(messagesData.items || []);
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

  async function downloadPdf(id, catalogTitle) {
    try {
      await downloadAuthenticatedFile(`/api/catalog/links/${id}/pdf?language=${language}`, `${catalogTitle || "catalog"}.pdf`);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleConvert(id) {
    try {
      await markCatalogOrderConverted(id);
      toast.success(language === "fa" ? "به عنوان تبدیل‌شده علامت خورد." : language === "ar" ? "تم وضع علامة كمحوَّل." : language === "tr" ? "Dönüştürüldü olarak işaretlendi." : "Marked as converted.");
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
        <h2 className="text-lg font-bold mb-4">{language === "fa" ? "کاتالوگ‌های ساخته‌شده" : language === "ar" ? "كتالوجاتك" : language === "tr" ? "Kataloglarınız" : "Your catalogs"}</h2>
        {loading ? (
          <p className="text-[var(--erp-muted)]">{language === "fa" ? "در حال بارگذاری..." : language === "ar" ? "جارٍ التحميل..." : language === "tr" ? "Yükleniyor..." : "Loading..."}</p>
        ) : catalogs.length === 0 ? (
          <p className="text-[var(--erp-muted)]">{language === "fa" ? "هنوز کاتالوگی نساخته‌اید." : language === "ar" ? "لا توجد كتالوجات بعد." : language === "tr" ? "Henüz katalog yok." : "No catalogs yet."}</p>
        ) : (
          <div className="space-y-3">
            {catalogs.map((catalog) => (
              <div key={catalog.id} className="rounded-xl bg-[var(--erp-panel-solid)] p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-bold">{catalog.title}</div>
                  <div className="text-xs text-[var(--erp-muted)]">
                    {n(catalog.product_count)} {language === "fa" ? "کالا" : language === "ar" ? "منتج" : language === "tr" ? "ürün" : "products"} •{" "}
                    {catalog.enabled
                      ? (language === "fa" ? "فعال" : language === "ar" ? "نشط" : language === "tr" ? "Aktif" : "Active")
                      : (language === "fa" ? "غیرفعال" : language === "ar" ? "معطّل" : language === "tr" ? "Devre dışı" : "Disabled")}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {catalog.enabled && (
                    <button onClick={() => copyLink(catalog.token)} className="px-3 py-2 rounded-xl bg-indigo-500/20 text-indigo-200 text-sm font-bold flex items-center gap-1">
                      <Copy size={14} /> {language === "fa" ? "کپی لینک" : language === "ar" ? "نسخ الرابط" : language === "tr" ? "Bağlantıyı kopyala" : "Copy link"}
                    </button>
                  )}
                  {catalog.enabled && (
                    <a
                      href={whatsappShareUrl(catalog, language)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-200 text-sm font-bold flex items-center gap-1"
                    >
                      <MessageCircle size={14} /> WhatsApp
                    </a>
                  )}
                  {catalog.enabled && (
                    <a
                      href={telegramShareUrl(catalog, language)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 rounded-xl bg-sky-500/20 text-sky-200 text-sm font-bold flex items-center gap-1"
                    >
                      <Send size={14} /> Telegram
                    </a>
                  )}
                  <button onClick={() => downloadPdf(catalog.id, catalog.title)} className="px-3 py-2 rounded-xl bg-[var(--erp-glow)] text-[var(--erp-accent)] text-sm font-bold flex items-center gap-1">
                    <FileDown size={14} /> PDF
                  </button>
                  {catalog.enabled ? (
                    <button onClick={() => handleRevoke(catalog.id)} className="px-3 py-2 rounded-xl bg-red-500/15 text-red-200 text-sm font-bold flex items-center gap-1">
                      <ShieldOff size={14} /> {language === "fa" ? "غیرفعال" : language === "ar" ? "تعطيل" : language === "tr" ? "Devre dışı bırak" : "Disable"}
                    </button>
                  ) : (
                    <button onClick={() => handleReactivate(catalog.id)} className="px-3 py-2 rounded-xl bg-emerald-500/15 text-emerald-200 text-sm font-bold">
                      {language === "fa" ? "فعال‌سازی" : language === "ar" ? "إعادة التفعيل" : language === "tr" ? "Yeniden etkinleştir" : "Reactivate"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

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
    </div>
  );
}
