/**
 * Contextual-help content registry (Task 03, Section 11) - a dedicated
 * content file kept out of localization/translations.js (which is a flat
 * single-string UI-label dictionary), mirroring the precedent already set
 * by localization/occasions.js and HelpCenter.jsx's own local SECTIONS
 * array for "large, page-specific content lives in its own file."
 *
 * Keyed by the same `key` values Sidebar.jsx's nav items already use, so
 * a route's help entry is a direct 1:1 lookup - see
 * components/ContextualHelp.jsx for how this is consumed (one injection
 * point in layout/MainLayout.jsx, not 40 per-page edits).
 *
 * Every field is written from what each page actually does as built in
 * this codebase - nothing here describes a capability the page doesn't
 * have. Pages this session didn't touch directly (e.g. UserManagement,
 * BankReconciliation) get shorter, more conservative entries rather than
 * invented specifics.
 */

function entry({ title, purpose, mainActions = [], keyFields = [], warnings = [], workflow = [] }) {
  return { title, purpose, mainActions, keyFields, warnings, workflow };
}

export const pageHelp = {
  dashboard: entry({
    title: { fa: "داشبورد", ar: "لوحة التحكم", tr: "Panel", en: "Dashboard" },
    purpose: {
      fa: "نمای کلی فروش، نقدینگی، سود و هشدارهای مهم کسب‌وکار در یک صفحه.",
      ar: "نظرة عامة على المبيعات والسيولة والأرباح والتنبيهات المهمة في صفحة واحدة.",
      tr: "Satış, nakit akışı, kâr ve önemli iş uyarılarına tek sayfadan genel bakış.",
      en: "One-page overview of sales, cash flow, profit, and important business alerts.",
    },
    mainActions: {
      fa: ["مشاهده آمار امروز/ماه", "دسترسی سریع به عملیات پرتکرار", "مرور هشدارهای مدیریتی بحرانی"],
      ar: ["عرض إحصاءات اليوم/الشهر", "وصول سريع للعمليات المتكررة", "مراجعة التنبيهات التنفيذية الحرجة"],
      tr: ["Bugün/ay istatistiklerini görüntüle", "Sık işlemlere hızlı erişim", "Kritik yönetici uyarılarını gözden geçir"],
      en: ["View today/month stats", "Quick access to frequent actions", "Review critical executive alerts"],
    },
    keyFields: { fa: [], ar: [], tr: [], en: [] },
    warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  customers: entry({
    title: { fa: "مشتریان و طرف‌حساب‌ها", ar: "العملاء والأطراف", tr: "Müşteriler ve Cariler", en: "Customers & Parties" },
    purpose: {
      fa: "ثبت و مدیریت مشتریان، تأمین‌کنندگان و سایر طرف‌حساب‌ها.",
      ar: "تسجيل وإدارة العملاء والموردين والأطراف الأخرى.",
      tr: "Müşteri, tedarikçi ve diğer carileri kaydedip yönetin.",
      en: "Register and manage customers, suppliers, and other parties.",
    },
    mainActions: {
      fa: ["افزودن طرف‌حساب جدید", "ویرایش اطلاعات تماس و آدرس", "تعیین گروه قیمت‌گذاری و کارشناس فروش", "مشاهده مانده حساب"],
      ar: ["إضافة طرف جديد", "تعديل بيانات الاتصال والعنوان", "تحديد مجموعة التسعير ومندوب المبيعات", "عرض الرصيد"],
      tr: ["Yeni cari ekle", "İletişim ve adres bilgisini düzenle", "Fiyat grubu ve satış temsilcisi ata", "Bakiyeyi görüntüle"],
      en: ["Add a new party", "Edit contact info and address", "Set pricing group and sales rep", "View balance"],
    },
    keyFields: {
      fa: ["نوع طرف‌حساب (مشتری/تأمین‌کننده/...)", "گروه قیمت‌گذاری (خرده/عمده)", "رضایت دریافت پیام تبلیغاتی"],
      ar: ["نوع الطرف", "مجموعة التسعير", "الموافقة على الرسائل الترويجية"],
      tr: ["Cari türü", "Fiyat grubu", "Pazarlama mesajı onayı"],
      en: ["Party type (customer/supplier/...)", "Pricing group (retail/wholesale)", "Marketing message consent"],
    },
    warnings: {
      fa: ["گروه قیمت‌گذاری روی پیشنهاد قیمت فاکتور اثر می‌گذارد."],
      ar: ["تؤثر مجموعة التسعير على السعر المقترح في الفاتورة."],
      tr: ["Fiyat grubu, fatura fiyat önerisini etkiler."],
      en: ["Pricing group affects the suggested invoice price."],
    },
  }),
  products: entry({
    title: { fa: "کالاها", ar: "المنتجات", tr: "Ürünler", en: "Products" },
    purpose: {
      fa: "ثبت و مدیریت کالاها، قیمت، موجودی و دسته‌بندی.",
      ar: "تسجيل وإدارة المنتجات والأسعار والمخزون والتصنيفات.",
      tr: "Ürünleri, fiyatı, stoku ve kategorileri yönetin.",
      en: "Register and manage products, pricing, stock, and categories.",
    },
    mainActions: {
      fa: ["افزودن/ویرایش کالا", "اسکن بارکد", "فیلتر بر اساس دسته/برند/وضعیت موجودی", "فعال یا غیرفعال کردن کالا"],
      ar: ["إضافة/تعديل منتج", "مسح الباركود", "التصفية حسب الفئة/العلامة/حالة المخزون", "تفعيل أو تعطيل المنتج"],
      tr: ["Ürün ekle/düzenle", "Barkod tara", "Kategori/marka/stok durumuna göre filtrele", "Ürünü etkinleştir/devre dışı bırak"],
      en: ["Add/edit a product", "Scan barcode", "Filter by category/brand/stock status", "Activate or deactivate a product"],
    },
    keyFields: {
      fa: ["کد/بارکد/SKU", "قیمت خرید و فروش", "حداقل موجودی", "دسته اصلی و زیردسته"],
      ar: ["الرمز/الباركود/SKU", "سعر الشراء والبيع", "الحد الأدنى للمخزون", "الفئة الرئيسية والفرعية"],
      tr: ["Kod/barkod/SKU", "Alış ve satış fiyatı", "Asgari stok", "Ana ve alt kategori"],
      en: ["Code/barcode/SKU", "Buy and sell price", "Minimum stock", "Main and sub-category"],
    },
    warnings: {
      fa: ["غیرفعال کردن کالا آن را از انتخاب در فاکتور جدید مخفی می‌کند، حذف نمی‌کند."],
      ar: ["تعطيل المنتج يخفيه من اختيار الفاتورة الجديدة، ولا يحذفه."],
      tr: ["Ürünü devre dışı bırakmak yeni faturada seçilmesini engeller, silmez."],
      en: ["Deactivating a product hides it from new invoices; it does not delete it."],
    },
  }),
  invoices: entry({
    title: { fa: "فاکتورها", ar: "الفواتير", tr: "Faturalar", en: "Invoices" },
    purpose: {
      fa: "صدور فاکتور فروش/خرید و مدیریت پرداخت‌ها.",
      ar: "إصدار فواتير البيع/الشراء وإدارة المدفوعات.",
      tr: "Satış/alış faturası kesin ve ödemeleri yönetin.",
      en: "Create sale/purchase invoices and manage payments.",
    },
    mainActions: {
      fa: ["انتخاب مشتری و افزودن ردیف کالا", "ثبت پرداخت نقدی/چک/تقسیطی", "چاپ یا خروجی PDF فاکتور", "مشاهده وضعیت پرداخت"],
      ar: ["اختيار العميل وإضافة سطور المنتجات", "تسجيل الدفع نقدًا/شيك/بالتقسيط", "طباعة أو تصدير الفاتورة PDF", "عرض حالة الدفع"],
      tr: ["Müşteri seç ve ürün satırı ekle", "Nakit/çek/taksitli ödeme kaydet", "Faturayı yazdır veya PDF olarak dışa aktar", "Ödeme durumunu görüntüle"],
      en: ["Select customer and add line items", "Record cash/cheque/installment payment", "Print or export invoice as PDF", "View payment status"],
    },
    keyFields: {
      fa: ["نوع فاکتور (فروش/خرید/برگشتی)", "قیمت واحد (پیشنهادی از قوانین قیمت‌گذاری، قابل تغییر دستی)", "وضعیت پرداخت"],
      ar: ["نوع الفاتورة", "سعر الوحدة (مقترح من قواعد التسعير، قابل للتعديل يدويًا)", "حالة الدفع"],
      tr: ["Fatura türü", "Birim fiyat (fiyatlandırma kurallarından önerilir, elle değiştirilebilir)", "Ödeme durumu"],
      en: ["Invoice type (sale/purchase/return)", "Unit price (suggested by pricing rules, manually overridable)", "Payment status"],
    },
    warnings: {
      fa: ["قیمت پیشنهادی الزام‌آور نیست؛ فروشنده می‌تواند آن را تغییر دهد."],
      ar: ["السعر المقترح غير ملزم؛ يمكن للبائع تغييره."],
      tr: ["Önerilen fiyat bağlayıcı değildir; satıcı değiştirebilir."],
      en: ["The suggested price is not binding — staff can override it."],
    },
  }),
  branches: entry({
    title: { fa: "شعبه‌ها", ar: "الفروع", tr: "Şubeler", en: "Branches" },
    purpose: {
      fa: "مدیریت شعبه‌های شرکت و اتصال آن‌ها به انبارها.",
      ar: "إدارة فروع الشركة وربطها بالمستودعات.",
      tr: "Şirket şubelerini yönetin ve depolara bağlayın.",
      en: "Manage company branches and link them to warehouses.",
    },
    mainActions: {
      fa: ["ثبت شعبه جدید", "ویرایش آدرس/تماس/مدیر شعبه", "تعیین انبار پیش‌فرض", "فعال یا غیرفعال کردن شعبه"],
      ar: ["إضافة فرع جديد", "تعديل العنوان/الاتصال/مدير الفرع", "تحديد المستودع الافتراضي", "تفعيل أو تعطيل الفرع"],
      tr: ["Yeni şube ekle", "Adres/iletişim/şube müdürünü düzenle", "Varsayılan depo belirle", "Şubeyi etkinleştir/devre dışı bırak"],
      en: ["Add a new branch", "Edit address/contact/manager", "Set a default warehouse", "Activate or deactivate a branch"],
    },
    keyFields: { fa: ["نوع شعبه", "انبار پیش‌فرض"], ar: ["نوع الفرع", "المستودع الافتراضي"], tr: ["Şube türü", "Varsayılan depo"], en: ["Branch type", "Default warehouse"] },
    warnings: {
      fa: ["شعبه‌ای که سابقه مالی/انبار دارد غیرفعال می‌شود، حذف نمی‌شود."],
      ar: ["الفرع الذي له سجل مالي/مخزون يُعطَّل ولا يُحذف."],
      tr: ["Mali/stok geçmişi olan şube devre dışı bırakılır, silinmez."],
      en: ["A branch with financial/stock history is deactivated, never deleted."],
    },
  }),
  multiWarehouse: entry({
    title: { fa: "شعبه‌ها و انبارهای متعدد", ar: "الفروع والمستودعات المتعددة", tr: "Çoklu şube ve depolar", en: "Multi-branch warehouses" },
    purpose: {
      fa: "مدیریت چند انبار، انتقال موجودی بین آن‌ها و مشاهده تفکیک موجودی هر کالا.",
      ar: "إدارة عدة مستودعات، نقل المخزون بينها، وعرض توزيع مخزون كل منتج.",
      tr: "Birden çok depoyu yönetin, aralarında stok transferi yapın, ürün bazında stok dağılımını görün.",
      en: "Manage multiple warehouses, transfer stock between them, and see per-product stock breakdown.",
    },
    mainActions: {
      fa: ["ساخت انبار جدید و اتصال به شعبه", "انتقال موجودی بین انبارها", "مشاهده موجودی هر کالا به تفکیک انبار"],
      ar: ["إنشاء مستودع جديد وربطه بفرع", "نقل المخزون بين المستودعات", "عرض مخزون كل منتج حسب المستودع"],
      tr: ["Yeni depo oluştur ve şubeye bağla", "Depolar arası stok transferi yap", "Ürün bazında depo stokunu görüntüle"],
      en: ["Create a warehouse and link it to a branch", "Transfer stock between warehouses", "View per-warehouse stock for a product"],
    },
    keyFields: { fa: ["انبار پیش‌فرض («Main»)"], ar: ["المستودع الافتراضي"], tr: ["Varsayılan depo"], en: ["Default warehouse (\"Main\")"] },
    warnings: {
      fa: ["موجودی انبار پیش‌فرض به‌صورت خودکار محاسبه می‌شود؛ آن را مستقیم ویرایش نکنید."],
      ar: ["يُحسب مخزون المستودع الافتراضي تلقائيًا؛ لا تعدّله مباشرة."],
      tr: ["Varsayılan depo stoku otomatik hesaplanır; doğrudan düzenlemeyin."],
      en: ["The default warehouse's stock is computed automatically — don't try to edit it directly."],
    },
  }),
  purchaseOrders: entry({
    title: { fa: "سفارش‌های خرید", ar: "أوامر الشراء", tr: "Satın Alma Siparişleri", en: "Purchase Orders" },
    purpose: {
      fa: "ثبت سفارش خرید نزد تأمین‌کننده، ارسال واقعی آن، و دریافت جزئی یا کامل موجودی در انبار مقصد دلخواه.",
      ar: "إنشاء أمر شراء لدى المورّد، إرساله فعليًا، واستلام جزئي أو كامل للمخزون في المستودع المطلوب.",
      tr: "Tedarikçiye sipariş oluşturun, gerçekten gönderin, istediğiniz depoya kısmi veya tam teslim alın.",
      en: "Create a purchase order for a supplier, actually dispatch it, and receive stock partially or fully into whichever warehouse it actually arrives at.",
    },
    mainActions: {
      fa: ["ثبت سفارش با ردیف کالا و انبار مقصد پیش‌فرض", "ارسال به تأمین‌کننده از طریق ایمیل/پیامک/واتس‌اپ/تلگرام یا تحویل دستی", "مشاهده تاریخچه ارسال", "ثبت دریافت (جزئی یا کامل) با انتخاب انبار مقصد", "مشاهده تاریخچه دریافت‌ها"],
      ar: ["إنشاء الأمر مع سطور المنتجات والمستودع الافتراضي", "الإرسال إلى المورّد عبر البريد/الرسائل/واتساب/تيليجرام أو التسليم اليدوي", "عرض سجل الإرسال", "تسجيل استلام جزئي أو كامل مع اختيار المستودع", "عرض سجل الاستلام"],
      tr: ["Ürün satırları ve varsayılan depo ile sipariş oluştur", "Tedarikçiye e-posta/SMS/WhatsApp/Telegram veya elden gönder", "Gönderim geçmişini görüntüle", "Depo seçerek kısmi veya tam teslim alma kaydet", "Teslim alma geçmişini görüntüle"],
      en: ["Create an order with line items and a default warehouse", "Dispatch to the supplier via email/SMS/WhatsApp/Telegram or manual delivery", "View dispatch history", "Record a partial or full receipt with a chosen destination warehouse", "View receipt history"],
    },
    keyFields: { fa: ["روش ارسال", "وضعیت سفارش (پیش‌نویس/ارسال‌شده/دریافت جزئی/دریافت‌شده/لغوشده)", "انبار مقصد"], ar: ["طريقة الإرسال", "حالة الأمر (مسودة/مُرسَل/استلام جزئي/مُستلَم/ملغى)", "المستودع المقصود"], tr: ["Gönderim yöntemi", "Sipariş durumu (taslak/gönderildi/kısmen alındı/alındı/iptal)", "Hedef depo"], en: ["Dispatch method", "Order status (draft/sent/partially received/received/cancelled)", "Destination warehouse"] },
    warnings: {
      fa: ["ثبت دریافت کالا موجودی انبار انتخابی را افزایش می‌دهد و قابل بازگشت ساده نیست.", "دریافت بیش از مقدار باقی‌مانده هر ردیف پذیرفته نمی‌شود.", "سفارشی که دریافت (حتی جزئی) شده باشد دیگر قابل لغو نیست."],
      ar: ["تسجيل الاستلام يزيد مخزون المستودع المختار وليس من السهل التراجع عنه.", "لا يُقبل استلام أكثر من الكمية المتبقية لأي بند.", "لا يمكن إلغاء أمر تم استلامه (ولو جزئيًا)."],
      tr: ["Teslim almak seçilen deponun stokunu artırır ve kolayca geri alınamaz.", "Herhangi bir kalemin kalan miktarından fazlası kabul edilmez.", "Kısmen bile teslim alınmış bir sipariş artık iptal edilemez."],
      en: ["Recording a receipt increases the chosen warehouse's stock and isn't easily reversible.", "Receiving more than a line's remaining quantity is rejected.", "An order that has been received (even partially) can no longer be cancelled."],
    },
  }),
  smartInventory: entry({
    title: { fa: "انبار هوشمند", ar: "المخزون الذكي", tr: "Akıllı Stok", en: "Smart Inventory" },
    purpose: {
      fa: "پیش‌بینی کمبود موجودی، شناسایی کالای راکد، برنامه سفارش مجدد و تحلیل ABC - در سطح کل شرکت یا یک شعبه مشخص.",
      ar: "توقع نفاد المخزون، تحديد المخزون الراكد، خطة إعادة الطلب وتحليل ABC - على مستوى الشركة بأكملها أو فرع محدد.",
      tr: "Stok tükenme tahmini, ölü stok tespiti, yeniden sipariş planı ve ABC analizi - tüm şirket veya belirli bir şube düzeyinde.",
      en: "Stockout forecasting, dead-stock detection, reorder planning, and ABC analysis - company-wide or scoped to one branch.",
    },
    mainActions: {
      fa: ["انتخاب شعبه برای تحلیل موجودی همان شعبه", "ساخت سفارش خرید خودکار از پیشنهادهای سفارش مجدد", "مشاهده کالاهای کم‌موجود/راکد/کلاس A"],
      ar: ["اختيار فرع لتحليل مخزون ذلك الفرع", "إنشاء أمر شراء تلقائي من اقتراحات إعادة الطلب", "عرض المنتجات منخفضة المخزون/الراكدة/فئة A"],
      tr: ["Şubeye ait stok analizi için şube seç", "Yeniden sipariş önerilerinden otomatik satın alma siparişi oluştur", "Düşük stoklu/ölü stok/A sınıfı ürünleri görüntüle"],
      en: ["Select a branch to analyze that branch's own stock", "Auto-create purchase orders from reorder suggestions", "View low-stock/dead-stock/class-A products"],
    },
    keyFields: {
      fa: ["موجودی نمایش‌داده‌شده بر اساس شعبه انتخابی است؛ کل موجودی شرکت هم همیشه قابل مشاهده است"],
      ar: ["المخزون المعروض حسب الفرع المختار؛ إجمالي مخزون الشركة متاح دائمًا للعرض"],
      tr: ["Gösterilen stok seçilen şubeye göredir; şirket toplamı her zaman görülebilir"],
      en: ["Displayed stock reflects the selected branch; the company-wide total is always shown alongside it"],
    },
    warnings: {
      fa: ["روند فروش و مقدار سفارش پیشنهادی هنوز بر اساس فروش کل شرکت محاسبه می‌شود، نه فروش همان شعبه."],
      ar: ["اتجاه المبيعات وكمية إعادة الطلب المقترحة لا تزال تُحسب من مبيعات الشركة بأكملها، وليس مبيعات ذلك الفرع فقط."],
      tr: ["Satış eğilimi ve önerilen yeniden sipariş miktarı hâlâ şirket geneli satışlara göre hesaplanır, sadece o şubenin satışlarına göre değil."],
      en: ["Sales-velocity and suggested-reorder-quantity math still uses company-wide sales, not that branch's sales alone."],
    },
  }),
  crmDashboard: entry({
    title: { fa: "داشبورد ارتباط با مشتری", ar: "لوحة إدارة علاقات العملاء", tr: "CRM panosu", en: "CRM dashboard" },
    purpose: {
      fa: "امتیازدهی سلامت هر مشتری (VIP/طلایی/معمولی/پرریسک) بر اساس فروش، مطالبات و سقف اعتبار، برای اولویت‌بندی پیگیری.",
      ar: "تسجيل صحة كل عميل (VIP/ذهبي/عادي/عالي المخاطر) بناءً على المبيعات والذمم المدينة وحد الائتمان، لترتيب أولويات المتابعة.",
      tr: "Takibi önceliklendirmek için satış, alacaklar ve kredi limitine göre her müşterinin sağlık puanı (VIP/Altın/Normal/Riskli).",
      en: "Per-customer health scoring (VIP/Gold/Normal/At-risk) from sales, receivables, and credit limit, to prioritize follow-up.",
    },
    mainActions: {
      fa: ["جست‌وجو/فیلتر مشتریان بر اساس سطح ریسک", "مشاهده پروفایل ۳۶۰ درجه یک مشتری", "شناسایی مشتریانی که نیاز به پیگیری فوری دارند"],
      ar: ["البحث/تصفية العملاء حسب مستوى الخطر", "عرض الملف الشخصي 360 لعميل", "تحديد العملاء الذين يحتاجون متابعة عاجلة"],
      tr: ["Müşterileri risk düzeyine göre ara/filtrele", "Bir müşterinin 360 profilini görüntüle", "Acil takip gerektiren müşterileri belirle"],
      en: ["Search/filter customers by risk level", "Open a customer's 360 profile", "Identify customers needing urgent follow-up"],
    },
    keyFields: {
      fa: ["امتیاز از فروش، سابقه فاکتور، مانده حساب و سقف اعتبار محاسبه می‌شود؛ عددی صرفاً نسبی است، نه یک شاخص مالی رسمی."],
      ar: ["يُحسب التقييم من المبيعات وسجل الفواتير والرصيد وحد الائتمان؛ رقم نسبي فقط وليس مؤشرًا ماليًا رسميًا."],
      tr: ["Puan; satış, fatura geçmişi, bakiye ve kredi limitinden hesaplanır; resmi bir finansal gösterge değil, göreli bir sayıdır."],
      en: ["The score is computed from sales, invoice history, balance and credit limit; it's a relative indicator, not a formal financial metric."],
    },
    warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  pricingTiers: entry({
    title: { fa: "قیمت‌گذاری پلکانی", ar: "التسعير المتدرج", tr: "Kademeli fiyatlandırma", en: "Tiered pricing" },
    purpose: {
      fa: "تعریف پله‌های قیمت بر اساس تعداد، و قوانین پیشرفته قیمت‌گذاری بر اساس محصول/مشتری/شعبه/تاریخ.",
      ar: "تحديد شرائح السعر حسب الكمية، وقواعد تسعير متقدمة حسب المنتج/العميل/الفرع/التاريخ.",
      tr: "Miktara göre fiyat kademeleri ve ürün/müşteri/şube/tarihe göre gelişmiş fiyatlandırma kuralları tanımlayın.",
      en: "Define quantity price breaks, and advanced rules by product/customer/branch/date.",
    },
    mainActions: {
      fa: ["افزودن پله قیمتی برای یک کالا", "ساخت قانون قیمت‌گذاری پیشرفته", "شبیه‌سازی قیمت نهایی برای یک سناریو"],
      ar: ["إضافة شريحة سعرية لمنتج", "إنشاء قاعدة تسعير متقدمة", "محاكاة السعر النهائي لسيناريو"],
      tr: ["Bir ürün için fiyat kademesi ekle", "Gelişmiş fiyatlandırma kuralı oluştur", "Bir senaryo için nihai fiyatı simüle et"],
      en: ["Add a price tier for a product", "Create an advanced pricing rule", "Simulate the final price for a scenario"],
    },
    keyFields: { fa: ["اولویت قانون", "محدوده محصول/مشتری", "بازه تاریخ"], ar: ["أولوية القاعدة", "نطاق المنتج/العميل", "الفترة الزمنية"], tr: ["Kural önceliği", "Ürün/müşteri kapsamı", "Tarih aralığı"], en: ["Rule priority", "Product/customer scope", "Date range"] },
    warnings: {
      fa: ["قانون خاص‌تر (مشتری+محصول مشخص) بر قانون کلی‌تر برتری دارد."],
      ar: ["القاعدة الأكثر تحديدًا (عميل+منتج محدد) تتقدم على القاعدة العامة."],
      tr: ["Daha spesifik kural (belirli müşteri+ürün) genel kuralın önüne geçer."],
      en: ["A more specific rule (exact customer + product) wins over a broader one."],
    },
    workflow: {
      fa: ["کالا و مشتری را در شبیه‌ساز انتخاب کنید", "قوانین منطبق و قانون برنده را ببینید", "قیمت نهایی را بررسی کنید"],
      ar: ["اختر المنتج والعميل في المحاكي", "شاهد القواعد المطابقة والقاعدة الفائزة", "تحقق من السعر النهائي"],
      tr: ["Simülatörde ürün ve müşteri seçin", "Eşleşen kuralları ve kazanan kuralı görün", "Nihai fiyatı kontrol edin"],
      en: ["Pick a product and customer in the simulator", "See matching rules and the winning one", "Check the final price"],
    },
  }),
  executiveAlerts: entry({
    title: { fa: "هشدارهای مدیریتی", ar: "التنبيهات التنفيذية", tr: "Yönetici Uyarıları", en: "Executive Alerts" },
    purpose: {
      fa: "مرور خودکار مطالبات، بدهی‌ها، چک‌ها و کمبود موجودی که نیاز به توجه دارند.",
      ar: "مراجعة تلقائية للمستحقات والديون والشيكات ونقص المخزون التي تحتاج انتباهًا.",
      tr: "Dikkat gerektiren alacak, borç, çek ve düşük stok kalemlerinin otomatik özeti.",
      en: "Automatic review of receivables, payables, cheques, and low stock needing attention.",
    },
    mainActions: {
      fa: ["مرور موارد بحرانی/هشدار در پنل داشبورد", "بستن پنل برای این نشست", "رفتن به مرکز هشدارها برای جزئیات کامل", "تنظیم آستانه‌های هشدار"],
      ar: ["مراجعة العناصر الحرجة/التحذيرية في لوحة التحكم", "إغلاق اللوحة لهذه الجلسة", "الانتقال لمركز التنبيهات للتفاصيل", "ضبط عتبات التنبيه"],
      tr: ["Panoda kritik/uyarı kalemlerini gözden geçir", "Bu oturum için paneli kapat", "Ayrıntılar için Uyarı Merkezi'ne git", "Uyarı eşiklerini ayarla"],
      en: ["Review critical/warning items in the Dashboard panel", "Dismiss the panel for this session", "Go to the Alerts Center for full detail", "Configure alert thresholds"],
    },
    keyFields: { fa: ["روزهای هشدار پیش از سررسید", "حداقل مبلغ مطالبه برای هشدار"], ar: ["أيام التنبيه قبل الاستحقاق", "الحد الأدنى للمبلغ"], tr: ["Vade öncesi uyarı günü", "Asgari alacak tutarı"], en: ["Days-before-due threshold", "Minimum receivable amount"] },
    warnings: {
      fa: ["بستن پنل، مورد را حل‌شده علامت نمی‌زند؛ فقط برای این نشست پنهان می‌کند."],
      ar: ["إغلاق اللوحة لا يعني حل العنصر؛ فقط يخفيه لهذه الجلسة."],
      tr: ["Paneli kapatmak öğeyi çözülmüş yapmaz; yalnızca bu oturum için gizler."],
      en: ["Dismissing the panel doesn't resolve the item — it only hides it for this session."],
    },
  }),
  budgetControl: entry({
    title: { fa: "بودجه", ar: "الميزانية", tr: "Bütçe", en: "Budget" },
    purpose: {
      fa: "برنامه‌ریزی بودجه مالی و کالایی، مقایسه بودجه با واقعی، و پیگیری روند مصرف.",
      ar: "تخطيط الميزانية المالية والسلعية، ومقارنة الميزانية بالفعلي، وتتبع الاستهلاك.",
      tr: "Mali ve mal bütçesi planlayın, bütçeyi gerçekleşenle karşılaştırın, kullanımı izleyin.",
      en: "Plan financial and goods budgets, compare budget to actual, and track utilization.",
    },
    mainActions: {
      fa: ["ساخت بودجه برای یک دوره مالی/سناریو", "ارسال برای تأیید", "مشاهده بودجه در برابر واقعی", "بستن یا آرشیو کردن بودجه دوره گذشته"],
      ar: ["إنشاء ميزانية لفترة مالية/سيناريو", "الإرسال للموافقة", "عرض الميزانية مقابل الفعلي", "إغلاق أو أرشفة ميزانية فترة سابقة"],
      tr: ["Bir dönem/senaryo için bütçe oluştur", "Onaya gönder", "Bütçeyi gerçekleşenle karşılaştır", "Geçmiş dönem bütçesini kapat/arşivle"],
      en: ["Create a budget for a period/scenario", "Submit for approval", "View budget vs. actual", "Close or archive a past-period budget"],
    },
    keyFields: { fa: ["دوره مالی", "سناریو (پایه/خوش‌بینانه/محافظه‌کارانه)", "حساب/دسته بودجه", "شعبه"], ar: ["الفترة المالية", "السيناريو", "الحساب/الفئة", "الفرع"], tr: ["Mali dönem", "Senaryo", "Hesap/kategori", "Şube"], en: ["Fiscal period", "Scenario (base/optimistic/conservative)", "Account/category", "Branch"] },
    warnings: {
      fa: ["بودجه تأییدشده به‌طور خاموش بازنویسی نمی‌شود؛ برای تغییر باید نسخه/بازبینی جدید ساخت."],
      ar: ["لا تُستبدل الميزانية المعتمدة بصمت؛ يجب إنشاء نسخة/مراجعة جديدة للتعديل."],
      tr: ["Onaylı bütçe sessizce üzerine yazılmaz; değişiklik için yeni sürüm/revizyon oluşturulmalı."],
      en: ["An approved budget is never silently overwritten — changes require a new version/revision."],
    },
  }),
  improvementCenter: entry({
    title: { fa: "مرکز بهبود", ar: "مركز التحسين", tr: "İyileştirme Merkezi", en: "Improvement Center" },
    purpose: {
      fa: "یافته‌های واقعی هوش تجاری (کاهش فروش، مطالبات معوق، موجودی راکد و...) را به برنامه بهبود ساختاریافته با مسئول، مهلت و پیگیری تبدیل می‌کند.",
      ar: "يحوّل نتائج ذكاء الأعمال الحقيقية (تراجع المبيعات، الذمم المتأخرة، المخزون الراكد...) إلى خطة تحسين منظمة بمسؤول وموعد نهائي ومتابعة.",
      tr: "Gerçek BI bulgularını (satış düşüşü, gecikmiş alacaklar, durgun stok vb.) sorumlusu, süresi ve takibi olan yapılandırılmış bir iyileştirme planına dönüştürür.",
      en: "Turns real BI findings (sales decline, overdue receivables, dead stock, etc.) into a structured improvement plan with an owner, deadline, and follow-up.",
    },
    mainActions: {
      fa: ["به‌روزرسانی یافته‌ها", "تأیید یا رد یک یافته", "ساخت برنامه اقدام برای یک یافته", "افزودن وظیفه و پیگیری پیشرفت", "حل کردن یا بازگشایی یک یافته"],
      ar: ["إعادة حساب النتائج", "الإقرار أو الرفض", "إنشاء خطة عمل لنتيجة", "إضافة مهمة ومتابعة التقدم", "حل أو إعادة فتح نتيجة"],
      tr: ["Bulguları yeniden hesapla", "Bir bulguyu onayla veya reddet", "Bir bulgu için eylem planı oluştur", "Görev ekle ve ilerlemeyi takip et", "Bir bulguyu çöz veya yeniden aç"],
      en: ["Recalculate findings", "Acknowledge or dismiss a finding", "Create an action plan for a finding", "Add a task and track progress", "Resolve or reopen a finding"],
    },
    keyFields: {
      fa: ["شدت (بحرانی/هشدار)", "شاخص/هدف برنامه اقدام", "مهلت وظیفه"],
      ar: ["الشدة", "مؤشر/هدف خطة العمل", "موعد المهمة"],
      tr: ["Önem derecesi", "Eylem planı KPI/hedefi", "Görev süresi"],
      en: ["Severity (critical/warning)", "Action plan target KPI", "Task deadline"],
    },
    warnings: {
      fa: ["یک یافته فقط با تکمیل وظایف حل‌شده تلقی نمی‌شود؛ حل کردن به دستیابی به هدف یا دلیل ثبت‌شده مدیر نیاز دارد."],
      ar: ["لا تُعتبر النتيجة محلولة لمجرد إكمال المهام؛ يتطلب الحل تحقيق الهدف أو سببًا مسجَّلاً من المدير."],
      tr: ["Görevler tamamlandı diye bir bulgu otomatik çözülmez; çözüm hedefe ulaşmayı veya kayıtlı bir yönetici gerekçesini gerektirir."],
      en: ["A finding is not resolved just because its tasks were completed — resolution requires meeting the target or a recorded manager override reason."],
    },
  }),
  catalogManager: entry({
    title: { fa: "کاتالوگ دیجیتال و چاپی", ar: "الكتالوج الرقمي والمطبوع", tr: "Dijital ve Basılı Katalog", en: "Digital & print catalog" },
    purpose: {
      fa: "ساخت کاتالوگ قابل‌اشتراک از کالاها برای مشتریان، با لینک عمومی، QR و خروجی PDF.",
      ar: "إنشاء كتالوج منتجات قابل للمشاركة للعملاء، برابط عام ورمز QR وتصدير PDF.",
      tr: "Müşteriler için genel bağlantı, QR ve PDF içeren paylaşılabilir ürün kataloğu oluşturun.",
      en: "Build a shareable product catalog for customers, with a public link, QR code, and PDF export.",
    },
    mainActions: {
      fa: ["ساخت کاتالوگ (بر اساس دسته یا انتخاب دستی کالا)", "اشتراک لینک/QR در واتس‌اپ یا تلگرام", "دانلود PDF", "لغو یا فعال‌سازی مجدد دسترسی", "مدیریت سفارش‌های واردشده"],
      ar: ["إنشاء كتالوج (حسب الفئة أو اختيار يدوي)", "مشاركة الرابط/QR عبر واتساب أو تيليجرام", "تنزيل PDF", "إلغاء أو إعادة تفعيل الوصول", "إدارة الطلبات الواردة"],
      tr: ["Katalog oluştur (kategoriye göre veya manuel seçim)", "Bağlantı/QR'ı WhatsApp veya Telegram'da paylaş", "PDF indir", "Erişimi iptal et veya yeniden etkinleştir", "Gelen siparişleri yönet"],
      en: ["Create a catalog (by category or manual product selection)", "Share the link/QR via WhatsApp or Telegram", "Download PDF", "Revoke or reactivate access", "Manage incoming orders"],
    },
    keyFields: { fa: ["فقط کالای موجود", "دسته‌بندی یا انتخاب دستی"], ar: ["المخزون المتوفر فقط", "الفئة أو الاختيار اليدوي"], tr: ["Yalnızca stoktakiler", "Kategori veya manuel seçim"], en: ["In-stock only", "Category or manual selection"] },
    warnings: {
      fa: ["لینک عمومی هیچ موجودی دقیق را نشان نمی‌دهد، فقط وضعیت موجود/ناموجود."],
      ar: ["الرابط العام لا يعرض كمية المخزون الدقيقة، فقط حالة متوفر/غير متوفر."],
      tr: ["Genel bağlantı kesin stok miktarını göstermez, yalnızca stokta var/yok durumunu gösterir."],
      en: ["The public link never shows exact stock quantities, only in-stock/out-of-stock."],
    },
  }),
  onlineCommerce: entry({
    title: { fa: "فروش آنلاین و تبلیغات", ar: "المبيعات والإعلانات عبر الإنترنت", tr: "Çevrimiçi Satış ve Reklam", en: "Online Sales & Advertising" },
    purpose: {
      fa: "انتشار کالا در فروشگاه آنلاین، ساخت کمپین‌های تبلیغاتی و مشاهده فرصت‌های فروش.",
      ar: "نشر المنتجات في المتجر الإلكتروني، وإنشاء حملات إعلانية، وعرض فرص المبيعات.",
      tr: "Ürünleri çevrimiçi mağazada yayınlayın, reklam kampanyaları oluşturun, satış fırsatlarını görün.",
      en: "Publish products to the online store, create ad campaigns, and view sales opportunities.",
    },
    mainActions: {
      fa: ["فعال کردن انتشار و تخفیف یک کالا", "ساخت کمپین با مخاطب هدف مشخص", "ارسال کمپین برای تأیید مدیر", "مرور مشتریان غیرفعال و کالاهای راکد"],
      ar: ["تفعيل نشر وخصم منتج", "إنشاء حملة بجمهور مستهدف محدد", "إرسال الحملة لموافقة المدير", "مراجعة العملاء غير النشطين والمنتجات الراكدة"],
      tr: ["Bir ürünün yayınını ve indirimini etkinleştir", "Belirli hedef kitleyle kampanya oluştur", "Kampanyayı yönetici onayına gönder", "Etkin olmayan müşterileri ve durgun ürünleri gözden geçir"],
      en: ["Enable publishing/discount for a product", "Create a campaign with a targeted audience", "Submit a campaign for manager approval", "Review inactive customers and slow-moving products"],
    },
    keyFields: { fa: ["مخاطب هدف (بخش‌بندی)", "قالب پیام و طرح گرافیکی"], ar: ["الجمهور المستهدف", "قالب الرسالة والتصميم"], tr: ["Hedef kitle", "Mesaj şablonu ve tasarım"], en: ["Target audience (segment)", "Message template and design"] },
    warnings: {
      fa: ["کمپین فقط برای مشتریانی که رضایت تبلیغاتی دارند در نظر گرفته می‌شود."],
      ar: ["تُحتسب الحملة فقط للعملاء الذين وافقوا على الرسائل الترويجية."],
      tr: ["Kampanya yalnızca pazarlama onayı veren müşteriler için hesaplanır."],
      en: ["A campaign only counts customers who've consented to marketing messages."],
    },
  }),
  changeRequests: entry({
    title: { fa: "درخواست‌های تغییر (صوتی/متنی)", ar: "طلبات التغيير (صوت/نص)", tr: "Değişiklik Talepleri (Sesli/Metin)", en: "Change Requests (voice/text)" },
    purpose: {
      fa: "ثبت درخواست تغییر با صدا یا متن، تبدیل به یک اقدام ساختاریافته، و اجرا فقط پس از تأیید مدیر.",
      ar: "تسجيل طلب تغيير بالصوت أو النص، وتحويله لإجراء منظم، وتنفيذه فقط بعد موافقة المدير.",
      tr: "Sesli veya metin değişiklik talebi girin, yapılandırılmış bir eyleme dönüştürün, yalnızca yönetici onayından sonra uygulayın.",
      en: "Submit a voice or text change request, turn it into a structured action, and execute only after manager approval.",
    },
    mainActions: {
      fa: ["ضبط یا آپلود صدا، یا نوشتن متن درخواست", "انتخاب نوع اقدام و تکمیل فیلدهای لازم", "ارسال برای تأیید", "مرور و تأیید/رد توسط مدیر"],
      ar: ["تسجيل أو رفع صوت، أو كتابة نص الطلب", "اختيار نوع الإجراء وتعبئة الحقول اللازمة", "الإرسال للموافقة", "المراجعة والموافقة/الرفض من المدير"],
      tr: ["Ses kaydet/yükle veya talep metnini yaz", "Eylem türünü seç ve gerekli alanları doldur", "Onaya gönder", "Yönetici tarafından incele ve onayla/reddet"],
      en: ["Record/upload audio, or type the request as text", "Pick an action type and fill required fields", "Submit for approval", "Manager reviews and approves/rejects"],
    },
    keyFields: { fa: ["نوع اقدام", "متن رونوشت (transcript)", "بار پیشنهادی (payload)"], ar: ["نوع الإجراء", "النص المفرغ", "البيانات المقترحة"], tr: ["Eylem türü", "Metin dökümü", "Önerilen veri"], en: ["Action type", "Transcript text", "Proposed payload"] },
    warnings: {
      fa: ["هیچ تغییری بدون تأیید صریح مدیر اجرا نمی‌شود؛ تبدیل صدا به متن دستی است."],
      ar: ["لا يُنفَّذ أي تغيير دون موافقة صريحة من المدير؛ تحويل الصوت إلى نص يدوي."],
      tr: ["Yönetici açık onayı olmadan hiçbir değişiklik uygulanmaz; ses-metin dönüşümü elle yapılır."],
      en: ["Nothing executes without explicit manager approval; voice-to-text is currently manual, not automated."],
    },
  }),
  reports: entry({
    title: { fa: "گزارش‌ها", ar: "التقارير", tr: "Raporlar", en: "Reports" },
    purpose: {
      fa: "گزارش‌های فروش، مشتریان، موجودی و تراکنش‌ها با امکان چاپ و خروجی.",
      ar: "تقارير المبيعات والعملاء والمخزون والمعاملات مع إمكانية الطباعة والتصدير.",
      tr: "Yazdırma ve dışa aktarma seçenekli satış, müşteri, stok ve işlem raporları.",
      en: "Sales, customer, inventory, and transaction reports with print/export.",
    },
    mainActions: {
      fa: ["انتخاب بازه زمانی و فیلتر", "مرور تب‌های مختلف گزارش", "چاپ یا خروجی گزارش"],
      ar: ["اختيار الفترة الزمنية والتصفية", "تصفح تبويبات التقرير المختلفة", "طباعة أو تصدير التقرير"],
      tr: ["Tarih aralığı ve filtre seç", "Farklı rapor sekmelerine göz at", "Raporu yazdır veya dışa aktar"],
      en: ["Select a date range and filters", "Browse different report tabs", "Print or export a report"],
    },
    keyFields: { fa: [], ar: [], tr: [], en: [] },
    warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  agingReport: entry({
    title: { fa: "سررسید مطالبات و بدهی‌ها", ar: "أعمار الذمم المدينة والدائنة", tr: "Alacak ve Borç Yaşlandırma", en: "Receivables & Payables Aging" },
    purpose: {
      fa: "مانده باز فاکتورها، تأخیر وصول و کنترل سقف اعتبار طرف‌حساب‌ها.",
      ar: "الفواتير المفتوحة، التأخر في التحصيل، ومراقبة حد الائتمان.",
      tr: "Açık faturalar, tahsilat gecikmesi ve cari kredi limiti kontrolü.",
      en: "Open invoices, overdue exposure, and party credit-limit control.",
    },
    mainActions: {
      fa: ["تعیین تاریخ گزارش و مهلت پرداخت", "فیلتر بین مطالبات/بدهی‌ها", "خروجی CSV یا چاپ"],
      ar: ["تحديد تاريخ التقرير ومهلة السداد", "التصفية بين الذمم المدينة والدائنة", "تصدير CSV أو الطباعة"],
      tr: ["Rapor tarihi ve ödeme vadesini belirle", "Alacak/borç arasında filtrele", "CSV dışa aktar veya yazdır"],
      en: ["Set report date and payment terms", "Filter between receivables/payables", "CSV export or print"],
    },
    keyFields: { fa: ["روز تأخیر", "سقف اعتبار"], ar: ["أيام التأخير", "حد الائتمان"], tr: ["Gecikme günü", "Kredi limiti"], en: ["Days overdue", "Credit limit"] },
    warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  financialStatements: entry({
    title: { fa: "صورت‌های مالی", ar: "القوائم المالية", tr: "Mali Tablolar", en: "Financial Statements" },
    purpose: {
      fa: "ترازنامه، صورت سود و زیان و صورت جریان وجوه نقد بر اساس اسناد ثبت‌شده.",
      ar: "الميزانية العمومية وقائمة الدخل وقائمة التدفقات النقدية بناءً على القيود المرحّلة.",
      tr: "Kaydedilmiş fişlere dayalı bilanço, gelir tablosu ve nakit akış tablosu.",
      en: "Balance sheet, income statement, and cash flow, based on posted vouchers.",
    },
    mainActions: {
      fa: ["انتخاب دوره مالی یا بازه تاریخ دلخواه", "جابه‌جایی بین ترازنامه/سود و زیان/جریان نقد", "چاپ یا خروجی"],
      ar: ["اختيار فترة مالية أو نطاق تاريخ", "التبديل بين الميزانية/الدخل/التدفق النقدي", "الطباعة أو التصدير"],
      tr: ["Mali dönem veya tarih aralığı seç", "Bilanço/gelir/nakit akış arasında geçiş yap", "Yazdır veya dışa aktar"],
      en: ["Select a fiscal period or custom date range", "Switch between balance sheet / income / cash flow", "Print or export"],
    },
    keyFields: { fa: ["ترازبودن (Balanced)"], ar: ["التوازن"], tr: ["Denge durumu"], en: ["Balanced status"] },
    warnings: {
      fa: ["فقط اسناد ثبت‌شده (posted) در محاسبه لحاظ می‌شوند."],
      ar: ["تُحتسب فقط القيود المرحّلة."],
      tr: ["Yalnızca kaydedilmiş (posted) fişler hesaba katılır."],
      en: ["Only posted vouchers are included in the calculation."],
    },
  }),
  salesPipeline: entry({
    title: { fa: "قیف فروش", ar: "مسار المبيعات", tr: "Satış Hunisi", en: "Sales Pipeline" },
    purpose: { fa: "پیگیری فرصت‌های فروش از تماس اولیه تا بستن معامله.", ar: "متابعة فرص البيع من التواصل الأول حتى الإغلاق.", tr: "Satış fırsatlarını ilk temastan kapanışa kadar takip edin.", en: "Track sales opportunities from first contact to close." },
    mainActions: { fa: ["افزودن فرصت جدید", "جابه‌جایی بین مراحل"], ar: ["إضافة فرصة جديدة", "النقل بين المراحل"], tr: ["Yeni fırsat ekle", "Aşamalar arasında taşı"], en: ["Add a new deal", "Move between stages"] },
    keyFields: { fa: [], ar: [], tr: [], en: [] }, warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  visitorModule: entry({
    title: { fa: "ویزیتور", ar: "المندوب الميداني", tr: "Saha Ziyaretçisi", en: "Visitor" },
    purpose: { fa: "ثبت ورود/خروج ویزیتور نزد مشتری با موقعیت مکانی و ثبت سفارش میدانی.", ar: "تسجيل دخول/خروج المندوب لدى العميل بالموقع الجغرافي وتسجيل الطلب الميداني.", tr: "Müşteride konum tabanlı check-in/out ve saha siparişi kaydı.", en: "Geofenced check-in/out at a customer and field order entry." },
    mainActions: { fa: ["ثبت ورود به مشتری", "ثبت سفارش یا نتیجه بازدید", "ثبت خروج"], ar: ["تسجيل الوصول للعميل", "تسجيل الطلب أو نتيجة الزيارة", "تسجيل المغادرة"], tr: ["Müşteriye giriş kaydet", "Sipariş veya ziyaret sonucu kaydet", "Çıkış kaydet"], en: ["Check in at a customer", "Log an order or visit outcome", "Check out"] },
    keyFields: { fa: [], ar: [], tr: [], en: [] }, warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  recurringInvoices: entry({
    title: { fa: "فاکتور تکرارشونده", ar: "الفواتير المتكررة", tr: "Tekrarlayan Faturalar", en: "Recurring Invoices" },
    purpose: { fa: "قالب فاکتورهایی که به‌طور دوره‌ای باید صادر شوند (مثلاً اشتراک ماهانه).", ar: "قوالب فواتير تصدر بشكل دوري (مثل اشتراك شهري).", tr: "Periyodik olarak kesilecek fatura şablonları (örn. aylık abonelik).", en: "Templates for invoices that should be issued on a recurring schedule." },
    mainActions: { fa: ["ساخت قالب فاکتور تکرارشونده", "تعیین دوره تکرار"], ar: ["إنشاء قالب فاتورة متكررة", "تحديد دورة التكرار"], tr: ["Tekrarlayan fatura şablonu oluştur", "Tekrar sıklığını belirle"], en: ["Create a recurring invoice template", "Set the recurrence interval"] },
    keyFields: { fa: [], ar: [], tr: [], en: [] }, warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  paymentReminders: entry({
    title: { fa: "یادآوری پرداخت", ar: "تذكير الدفع", tr: "Ödeme Hatırlatmaları", en: "Payment Reminders" },
    purpose: { fa: "یادآوری خودکار یا دستی فاکتورهای سررسیدگذشته از طریق ایمیل/تلگرام/واتس‌اپ.", ar: "تذكير تلقائي أو يدوي بالفواتير المتأخرة عبر البريد/تيليجرام/واتساب.", tr: "Vadesi geçmiş faturalar için e-posta/Telegram/WhatsApp üzerinden otomatik veya manuel hatırlatma.", en: "Automatic or manual reminders for overdue invoices via email/Telegram/WhatsApp." },
    mainActions: { fa: ["مشاهده فاکتورهای سررسیدگذشته", "ارسال یادآوری فوری", "مشاهده تاریخچه ارسال"], ar: ["عرض الفواتير المتأخرة", "إرسال تذكير فوري", "عرض سجل الإرسال"], tr: ["Vadesi geçmiş faturaları görüntüle", "Anında hatırlatma gönder", "Gönderim geçmişini görüntüle"], en: ["View overdue invoices", "Send an immediate reminder", "View send history"] },
    keyFields: { fa: ["سطح لحن (دوستانه/جدی/نهایی)"], ar: ["مستوى النبرة"], tr: ["Ton seviyesi"], en: ["Tone tier (friendly/firm/urgent)"] }, warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  transactions: entry({
    title: { fa: "تراکنش‌ها", ar: "المعاملات", tr: "İşlemler", en: "Transactions" },
    purpose: { fa: "ثبت و مرور دریافت‌ها و پرداخت‌های نقدی/بانکی.", ar: "تسجيل ومراجعة المقبوضات والمدفوعات النقدية/البنكية.", tr: "Nakit/banka tahsilat ve ödemelerini kaydedin ve görüntüleyin.", en: "Record and review cash/bank receipts and payments." },
    mainActions: { fa: ["ثبت دریافت یا پرداخت جدید", "جستجو بین تراکنش‌ها"], ar: ["تسجيل مقبوضات أو مدفوعات جديدة", "البحث بين المعاملات"], tr: ["Yeni tahsilat/ödeme kaydet", "İşlemler arasında ara"], en: ["Record a new receipt or payment", "Search transactions"] },
    keyFields: { fa: [], ar: [], tr: [], en: [] }, warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  expenses: entry({
    title: { fa: "هزینه‌ها", ar: "المصروفات", tr: "Giderler", en: "Expenses" },
    purpose: { fa: "ثبت هزینه‌های عملیاتی شرکت با دسته‌بندی.", ar: "تسجيل مصروفات الشركة التشغيلية مصنّفة.", tr: "Şirketin operasyonel giderlerini kategorize ederek kaydedin.", en: "Record the company's operating expenses by category." },
    mainActions: { fa: ["ثبت هزینه جدید", "فیلتر بر اساس دسته و تاریخ"], ar: ["تسجيل مصروف جديد", "التصفية حسب الفئة والتاريخ"], tr: ["Yeni gider kaydet", "Kategori ve tarihe göre filtrele"], en: ["Record a new expense", "Filter by category and date"] },
    keyFields: { fa: [], ar: [], tr: [], en: [] }, warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  productCategories: entry({
    title: { fa: "دسته‌بندی کالا", ar: "تصنيفات المنتجات", tr: "Ürün Kategorileri", en: "Product Categories" },
    purpose: { fa: "مدیریت دسته اصلی و زیردسته کالاها که در فیلترها و قوانین قیمت‌گذاری استفاده می‌شود.", ar: "إدارة الفئة الرئيسية والفرعية للمنتجات المستخدمة في التصفية وقواعد التسعير.", tr: "Filtrelerde ve fiyat kurallarında kullanılan ana/alt kategorileri yönetin.", en: "Manage the main/sub-categories used in filters and pricing rules." },
    mainActions: { fa: ["افزودن دسته یا زیردسته"], ar: ["إضافة فئة أو فئة فرعية"], tr: ["Kategori/alt kategori ekle"], en: ["Add a category or sub-category"] },
    keyFields: { fa: [], ar: [], tr: [], en: [] }, warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  warehouse: entry({
    title: { fa: "انبار (ثبت تردد کالا)", ar: "المستودع (حركة المخزون)", tr: "Depo (Stok Hareketi)", en: "Warehouse (stock movement)" },
    purpose: { fa: "ثبت ورود/خروج/اصلاح موجودی و مشاهده تاریخچه تردد کالا.", ar: "تسجيل دخول/خروج/تعديل المخزون وعرض سجل الحركة.", tr: "Stok giriş/çıkış/düzeltme kaydı ve hareket geçmişi.", en: "Record stock in/out/adjustment and view movement history." },
    mainActions: { fa: ["ثبت حرکت موجودی جدید"], ar: ["تسجيل حركة مخزون جديدة"], tr: ["Yeni stok hareketi kaydet"], en: ["Record a new stock movement"] },
    keyFields: { fa: [], ar: [], tr: [], en: [] }, warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  chartOfAccounts: entry({
    title: { fa: "کدینگ حساب‌ها", ar: "دليل الحسابات", tr: "Hesap Planı", en: "Chart of Accounts" },
    purpose: {
      fa: "ساختار درختی حساب‌های حسابداری (دارایی، بدهی، سرمایه، درآمد، هزینه) که همه اسناد و بودجه‌ها به آن‌ها ارجاع می‌دهند.",
      ar: "الهيكل الشجري لحسابات المحاسبة (الأصول، الالتزامات، حقوق الملكية، الإيرادات، المصروفات) التي تُشير إليها جميع القيود والميزانيات.",
      tr: "Tüm fişlerin ve bütçelerin referans aldığı hesap ağacı (varlık, yükümlülük, özkaynak, gelir, gider).",
      en: "The tree of accounting accounts (asset, liability, equity, revenue, expense) that every voucher and budget references.",
    },
    mainActions: {
      fa: ["افزودن حساب جدید", "ویرایش حساب", "غیرفعال‌سازی حساب", "بارگذاری کدینگ پیش‌فرض"],
      ar: ["إضافة حساب جديد", "تعديل حساب", "تعطيل حساب", "تحميل الدليل الافتراضي"],
      tr: ["Yeni hesap ekle", "Hesabı düzenle", "Hesabı devre dışı bırak", "Varsayılan planı yükle"],
      en: ["Add a new account", "Edit an account", "Deactivate an account", "Seed the default chart"],
    },
    keyFields: {
      fa: ["کد و سطح حساب (گروه/کل/معین/تفصیلی)", "نوع حساب و ماهیت بدهکار/بستانکار"],
      ar: ["رمز الحساب ومستواه", "نوع الحساب وطبيعته المدين/الدائن"],
      tr: ["Hesap kodu ve seviyesi", "Hesap türü ve borç/alacak niteliği"],
      en: ["Account code and level (group/ledger/subsidiary/detail)", "Account type and normal debit/credit balance"],
    },
    warnings: {
      fa: ["حذف یا تغییر حساب‌های دارای سابقه حسابداری می‌تواند بر گزارش‌های مالی اثر بگذارد."],
      ar: ["حذف أو تغيير الحسابات ذات السجل المحاسبي قد يؤثر على التقارير المالية."],
      tr: ["Muhasebe geçmişi olan hesapları silmek veya değiştirmek mali raporları etkileyebilir."],
      en: ["Deleting or changing accounts with existing accounting history can affect financial reports."],
    },
  }),
  accountingEntries: entry({
    title: { fa: "اسناد حسابداری", ar: "القيود المحاسبية", tr: "Muhasebe Fişleri", en: "Accounting Vouchers" },
    purpose: { fa: "ثبت و پیگیری اسناد حسابداری دستی و ثبت‌شده خودکار.", ar: "تسجيل ومتابعة القيود اليدوية والتلقائية.", tr: "Manuel ve otomatik oluşturulan muhasebe fişlerini kaydedin ve takip edin.", en: "Record and track manual and auto-generated accounting vouchers." },
    mainActions: { fa: ["ثبت سند جدید", "مشاهده وضعیت (پیش‌نویس/ثبت‌شده)"], ar: ["تسجيل قيد جديد", "عرض الحالة"], tr: ["Yeni fiş oluştur", "Durumu görüntüle"], en: ["Create a new voucher", "View status (draft/posted)"] },
    keyFields: { fa: [], ar: [], tr: [], en: [] }, warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  fiscalPeriods: entry({
    title: { fa: "دوره‌های مالی", ar: "الفترات المالية", tr: "Mali Dönemler", en: "Fiscal Periods" },
    purpose: { fa: "تعریف و بستن دوره‌های مالی که بودجه و صورت‌های مالی به آن‌ها ارجاع می‌دهند.", ar: "تعريف وإغلاق الفترات المالية التي تُشير إليها الميزانيات والقوائم المالية.", tr: "Bütçe ve mali tabloların referans aldığı mali dönemleri tanımlayın ve kapatın.", en: "Define and close the fiscal periods that budgets and financial statements reference." },
    mainActions: { fa: ["تعریف دوره جدید", "بستن دوره"], ar: ["تعريف فترة جديدة", "إغلاق الفترة"], tr: ["Yeni dönem tanımla", "Dönemi kapat"], en: ["Define a new period", "Close a period"] },
    keyFields: { fa: [], ar: [], tr: [], en: [] },
    warnings: { fa: ["بستن دوره روی امکان ثبت سند در آن دوره اثر می‌گذارد."], ar: ["إغلاق الفترة يؤثر على إمكانية تسجيل قيود فيها."], tr: ["Dönemi kapatmak o dönemde fiş kaydını etkiler."], en: ["Closing a period affects whether vouchers can still be posted to it."] },
  }),
  taxAccounting: entry({
    title: { fa: "امور مالیاتی", ar: "المحاسبة الضريبية", tr: "Vergi Muhasebesi", en: "Tax Accounting" },
    purpose: { fa: "مرور دفتر مالیات بر ارزش‌افزوده بر اساس فاکتورهای ثبت‌شده.", ar: "مراجعة دفتر ضريبة القيمة المضافة بناءً على الفواتير المسجلة.", tr: "Kayıtlı faturalara dayalı KDV defterini görüntüleyin.", en: "Review the VAT ledger based on recorded invoices." },
    mainActions: { fa: ["انتخاب دوره مالیاتی"], ar: ["اختيار الفترة الضريبية"], tr: ["Vergi dönemini seç"], en: ["Select a tax period"] },
    keyFields: { fa: [], ar: [], tr: [], en: [] }, warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  bankReconciliation: entry({
    title: { fa: "تطبیق بانکی", ar: "التسوية البنكية", tr: "Banka Mutabakatı", en: "Bank Reconciliation" },
    purpose: { fa: "تطبیق تراکنش‌های صورت‌حساب بانکی با اسناد ثبت‌شده در سیستم.", ar: "مطابقة معاملات كشف الحساب البنكي مع القيود المسجلة.", tr: "Banka ekstresi işlemlerini sistemdeki kayıtlarla eşleştirin.", en: "Match bank statement transactions against recorded system entries." },
    mainActions: { fa: ["انتخاب حساب بانکی", "تطبیق ردیف‌ها"], ar: ["اختيار الحساب البنكي", "مطابقة السطور"], tr: ["Banka hesabını seç", "Satırları eşleştir"], en: ["Select a bank account", "Match line items"] },
    keyFields: { fa: [], ar: [], tr: [], en: [] }, warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  treasuryCheques: entry({
    title: { fa: "چک‌ها", ar: "الشيكات", tr: "Çekler", en: "Cheques" },
    purpose: { fa: "ثبت و پیگیری چک‌های دریافتنی و پرداختنی تا زمان وصول یا سررسید.", ar: "تسجيل ومتابعة الشيكات الواردة والصادرة حتى التحصيل أو الاستحقاق.", tr: "Alınan ve verilen çekleri tahsilat/vadeye kadar kaydedin ve takip edin.", en: "Record and track incoming/outgoing cheques through to clearing or due date." },
    mainActions: { fa: ["ثبت چک جدید", "تغییر وضعیت (وصول‌شده/برگشتی)"], ar: ["تسجيل شيك جديد", "تغيير الحالة"], tr: ["Yeni çek kaydet", "Durumu değiştir"], en: ["Record a new cheque", "Change status (cleared/bounced)"] },
    keyFields: { fa: ["جهت (دریافتنی/پرداختنی)", "تاریخ سررسید"], ar: ["الاتجاه", "تاريخ الاستحقاق"], tr: ["Yön", "Vade tarihi"], en: ["Direction (incoming/outgoing)", "Due date"] }, warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  currencyManagement: entry({
    title: { fa: "مدیریت ارز", ar: "إدارة العملات", tr: "Döviz Yönetimi", en: "Currency Management" },
    purpose: { fa: "مشاهده مانده حساب‌های ارزی و نرخ تبدیل.", ar: "عرض أرصدة الحسابات بالعملات الأجنبية وأسعار الصرف.", tr: "Döviz hesap bakiyelerini ve kurları görüntüleyin.", en: "View foreign-currency account balances and exchange rates." },
    mainActions: { fa: ["انتخاب دوره و تاریخ ارزیابی"], ar: ["اختيار الفترة وتاريخ التقييم"], tr: ["Dönem ve değerleme tarihini seç"], en: ["Select period and valuation date"] },
    keyFields: { fa: [], ar: [], tr: [], en: [] }, warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  aiBusiness: entry({
    title: { fa: "هوش تجاری", ar: "ذكاء الأعمال", tr: "İş Zekası", en: "Business Intelligence" },
    purpose: { fa: "شاخص‌های محاسبه‌شده روند فروش، سود، مشتریان پرریسک و کالاهای راکد.", ar: "مؤشرات محسوبة لاتجاه المبيعات والأرباح والعملاء عاليي المخاطر والمنتجات الراكدة.", tr: "Satış trendi, kâr, riskli müşteriler ve durgun ürünler için hesaplanmış göstergeler.", en: "Computed indicators for sales trend, profit, at-risk customers, and dead stock." },
    mainActions: { fa: ["مرور شاخص‌های کلیدی و توصیه‌ها"], ar: ["مراجعة المؤشرات الرئيسية والتوصيات"], tr: ["Ana göstergeleri ve önerileri incele"], en: ["Review key indicators and recommendations"] },
    keyFields: { fa: [], ar: [], tr: [], en: [] },
    warnings: { fa: ["این شاخص‌ها محاسبات آماری هستند، نه پیش‌بینی مبتنی بر هوش مصنوعی."], ar: ["هذه المؤشرات حسابات إحصائية، وليست تنبؤات ذكاء اصطناعي."], tr: ["Bu göstergeler istatistiksel hesaplamalardır, AI tahmini değildir."], en: ["These indicators are statistical computations, not AI predictions."] },
  }),
  fixedAssets: entry({
    title: { fa: "دارایی‌های ثابت", ar: "الأصول الثابتة", tr: "Duran Varlıklar", en: "Fixed Assets" },
    purpose: { fa: "ثبت دارایی‌های ثابت شرکت و پیگیری استهلاک.", ar: "تسجيل الأصول الثابتة للشركة ومتابعة الإهلاك.", tr: "Şirketin duran varlıklarını kaydedin ve amortismanı takip edin.", en: "Register the company's fixed assets and track depreciation." },
    mainActions: { fa: ["ثبت دارایی جدید"], ar: ["تسجيل أصل جديد"], tr: ["Yeni varlık kaydet"], en: ["Register a new asset"] },
    keyFields: { fa: [], ar: [], tr: [], en: [] }, warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  approvalCenter: entry({
    title: { fa: "مرکز تأییدها", ar: "مركز الموافقات", tr: "Onay Merkezi", en: "Approval Center" },
    purpose: { fa: "مرور و تأیید/رد درخواست‌هایی که نیاز به تأیید مدیر دارند (اسناد، خرید، بودجه و...).", ar: "مراجعة والموافقة/رفض الطلبات التي تحتاج موافقة المدير.", tr: "Yönetici onayı gerektiren talepleri incele ve onayla/reddet.", en: "Review and approve/reject requests requiring manager sign-off." },
    mainActions: { fa: ["مرور درخواست در انتظار", "تأیید یا رد با یادداشت"], ar: ["مراجعة الطلب المعلق", "الموافقة أو الرفض مع ملاحظة"], tr: ["Bekleyen talebi incele", "Notla onayla veya reddet"], en: ["Review a pending request", "Approve or reject with a note"] },
    keyFields: { fa: [], ar: [], tr: [], en: [] },
    warnings: { fa: ["درخواست‌دهنده نمی‌تواند درخواست خودش را تأیید کند."], ar: ["لا يمكن لمقدّم الطلب الموافقة على طلبه."], tr: ["Talep sahibi kendi talebini onaylayamaz."], en: ["The requester cannot approve their own request."] },
  }),
  auditTrail: entry({
    title: { fa: "ردیابی رویدادها", ar: "سجل التدقيق", tr: "Denetim İzi", en: "Audit Trail" },
    purpose: { fa: "مشاهده تاریخچه رویدادهای مهم سیستم به‌ترتیب زمانی.", ar: "عرض سجل الأحداث المهمة بترتيب زمني.", tr: "Önemli sistem olaylarının kronolojik geçmişini görüntüleyin.", en: "View a chronological history of important system events." },
    mainActions: { fa: ["مرور صفحه‌بندی‌شده رویدادها"], ar: ["تصفح الأحداث مقسّمة لصفحات"], tr: ["Sayfalanmış olayları incele"], en: ["Browse paginated events"] },
    keyFields: { fa: [], ar: [], tr: [], en: [] }, warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  userManagement: entry({
    title: { fa: "مدیریت کاربران", ar: "إدارة المستخدمين", tr: "Kullanıcı Yönetimi", en: "User Management" },
    purpose: { fa: "ساخت کاربران و تعیین نقش/دسترسی آن‌ها.", ar: "إنشاء المستخدمين وتحديد أدوارهم/صلاحياتهم.", tr: "Kullanıcı oluşturun ve rol/yetkilerini belirleyin.", en: "Create users and set their role/permissions." },
    mainActions: { fa: ["افزودن کاربر جدید", "تغییر نقش"], ar: ["إضافة مستخدم جديد", "تغيير الدور"], tr: ["Yeni kullanıcı ekle", "Rolü değiştir"], en: ["Add a new user", "Change role"] },
    keyFields: { fa: ["نقش (ادمین/حسابدار/فروش/انبار/...)"], ar: ["الدور"], tr: ["Rol"], en: ["Role (admin/accountant/sales/warehouse/...)"] },
    warnings: { fa: ["نقش کاربر مستقیماً روی دسترسی‌های او در کل سیستم اثر می‌گذارد."], ar: ["يؤثر دور المستخدم مباشرة على صلاحياته في كامل النظام."], tr: ["Kullanıcı rolü, sistem genelindeki yetkilerini doğrudan etkiler."], en: ["A user's role directly controls their access across the whole system."] },
  }),
  employees: entry({
    title: { fa: "پرسنل", ar: "الموظفون", tr: "Personel", en: "Employees" },
    purpose: {
      fa: "پرونده منابع انسانی هر کارمند: پروفایل، تاریخچه شغلی، دفتر پرداخت، مرخصی، حضور، مدارک و ارزیابی عملکرد.",
      ar: "السجل البشري لكل موظف: الملف الشخصي، السجل الوظيفي، دفتر التعويضات، الإجازات، الحضور، المستندات وتقييم الأداء.",
      tr: "Her çalışanın İK kaydı: profil, istihdam geçmişi, ücret defteri, izin, devam, belgeler ve performans değerlendirmesi.",
      en: "The HR record for each employee: profile, employment history, compensation ledger, leave, attendance, documents, and performance review.",
    },
    mainActions: {
      fa: ["افزودن کارمند جدید", "ثبت پرداخت", "ثبت درخواست مرخصی و تأیید آن", "بارگذاری مدرک با تاریخ انقضا", "ثبت ارزیابی عملکرد"],
      ar: ["إضافة موظف جديد", "تسجيل تعويض", "تقديم طلب إجازة والموافقة عليه", "رفع مستند بتاريخ انتهاء", "تسجيل تقييم أداء"],
      tr: ["Yeni çalışan ekle", "Ücret kaydet", "İzin isteği gönder ve onayla", "Son kullanma tarihli belge yükle", "Performans değerlendirmesi kaydet"],
      en: ["Add a new employee", "Record a compensation entry", "Submit and approve a leave request", "Upload a document with an expiry date", "Record a performance review"],
    },
    keyFields: {
      fa: ["User = حساب ورود، Employee = پرونده منابع انسانی (اختیاری به هم متصل می‌شوند)", "مدیر مستقیم"],
      ar: ["User = حساب الدخول، Employee = السجل البشري (يمكن ربطهما اختياريًا)", "المدير المباشر"],
      tr: ["User = giriş hesabı, Employee = İK kaydı (isteğe bağlı bağlanır)", "Doğrudan yönetici"],
      en: ["User = login account, Employee = HR record (optionally linked)", "Direct manager"],
    },
    warnings: {
      fa: ["دفتر پرداخت یک سیستم حقوق و دستمزد قانونی کامل نیست؛ فقط ثبت مبالغ است.", "حضور و غیاب فقط به‌صورت دستی ثبت می‌شود، بدون اتصال به دستگاه.", "مدیر فقط زیرمجموعه مستقیم خود را می‌بیند، نه اطلاعات پرداختی آن‌ها."],
      ar: ["دفتر التعويضات ليس نظام رواتب قانونيًا كاملاً؛ إنه تسجيل للمبالغ فقط.", "الحضور يُسجَّل يدويًا فقط، دون اتصال بجهاز.", "يرى المدير مرؤوسيه المباشرين فقط، وليس بيانات تعويضاتهم."],
      tr: ["Ücret defteri tam bir yasal bordro sistemi değildir; yalnızca tutar kaydıdır.", "Devam yalnızca manuel olarak girilir, bir cihazla entegre değildir.", "Yönetici yalnızca doğrudan bağlı çalışanlarını görür, onların ücret bilgilerini değil."],
      en: ["The compensation ledger is not a full statutory payroll system — it only records amounts.", "Attendance is manual-entry only, with no time-clock device integration.", "A manager sees only their direct reports, not their compensation data."],
    },
  }),
  companyManagement: entry({
    title: { fa: "مدیریت شرکت‌ها", ar: "إدارة الشركات", tr: "Şirket Yönetimi", en: "Company Management" },
    purpose: { fa: "مدیریت شرکت‌های چندگانه در استقرار چندمستأجری (فقط سوپرادمین).", ar: "إدارة الشركات المتعددة في نشر متعدد المستأجرين (لمسؤول النظام فقط).", tr: "Çoklu kiracı dağıtımında birden çok şirketi yönetin (yalnızca süper yönetici).", en: "Manage multiple companies in a multi-tenant deployment (super-admin only)." },
    mainActions: { fa: ["افزودن شرکت جدید", "جابه‌جایی بین شرکت‌ها"], ar: ["إضافة شركة جديدة", "التبديل بين الشركات"], tr: ["Yeni şirket ekle", "Şirketler arasında geçiş yap"], en: ["Add a new company", "Switch between companies"] },
    keyFields: { fa: [], ar: [], tr: [], en: [] }, warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  companyProfile: entry({
    title: { fa: "پروفایل کامل شرکت", ar: "الملف الشامل للشركة", tr: "Tam Şirket Profili", en: "Complete Company Profile" },
    purpose: {
      fa: "هویت حقوقی، فعالیت کسب‌وکار، مأموریت/چشم‌انداز، تماس، بانکی، مدارک و اهداف راهبردی شرکت خودتان را مدیریت می‌کند.",
      ar: "يدير الهوية القانونية ونشاط الأعمال والمهمة/الرؤية والاتصال والبنك والمستندات والأهداف الاستراتيجية لشركتك.",
      tr: "Kendi şirketinizin yasal kimliği, iş faaliyeti, misyon/vizyon, iletişim, banka, belgeler ve stratejik hedeflerini yönetir.",
      en: "Manages your own company's legal identity, business activity, mission/vision, contact, banking, documents, and strategic goals.",
    },
    mainActions: {
      fa: ["ویرایش هویت و فعالیت", "افزودن هدف راهبردی", "بارگذاری مدرک شرکت با تاریخ انقضا", "مشاهده شعبه‌ها/انبارها/کاربران مرتبط"],
      ar: ["تعديل الهوية والنشاط", "إضافة هدف استراتيجي", "رفع مستند مع تاريخ انتهاء", "عرض الفروع/المستودعات/المستخدمين"],
      tr: ["Kimlik ve faaliyeti düzenle", "Stratejik hedef ekle", "Son kullanma tarihli belge yükle", "İlişkili şube/depo/kullanıcıları görüntüle"],
      en: ["Edit identity and activity", "Add a strategic goal", "Upload a company document with an expiry date", "View related branches/warehouses/users"],
    },
    keyFields: {
      fa: ["نام تجاری و لوگو از تنظیمات اصلی می‌آیند", "نوع شرکت", "شماره IBAN"],
      ar: ["الاسم التجاري والشعار من الإعدادات الرئيسية", "نوع الشركة", "رقم IBAN"],
      tr: ["Ticari ad ve logo ana Ayarlar'dan gelir", "Şirket türü", "IBAN numarası"],
      en: ["Trading name and logo come from the main Settings page", "Company type", "IBAN number"],
    },
    warnings: {
      fa: ["این صفحه فقط برای مدیر همان شرکت است؛ برای مدیریت چند شرکت از «مدیریت شرکت‌ها» (سوپرادمین) استفاده کنید."],
      ar: ["هذه الصفحة لمسؤول الشركة نفسها فقط؛ لإدارة عدة شركات استخدم «إدارة الشركات» (مسؤول النظام)."],
      tr: ["Bu sayfa yalnızca aynı şirketin yöneticisi içindir; birden çok şirketi yönetmek için «Şirket Yönetimi» (süper yönetici) kullanın."],
      en: ["This page is for that company's own admin only — use Company Management (super-admin) to manage multiple companies."],
    },
  }),
  executiveAgent: entry({
    title: { fa: "دستیار مدیریتی", ar: "المساعد التنفيذي", tr: "Yönetici Asistanı", en: "Executive Agent" },
    purpose: {
      fa: "به سوال‌های کسب‌وکاری مدیران (فروش، سود، مطالبات، موجودی، شعبه‌ها، بودجه و غیره) با داده واقعی و قابل استناد پاسخ می‌دهد؛ هرگز عددی را حدس نمی‌زند و هیچ عملیات نوشتنی را بی‌درنگ اجرا نمی‌کند.",
      ar: "يجيب على أسئلة المدراء التجارية (المبيعات، الربح، الذمم، المخزون، الفروع، الميزانية...) ببيانات حقيقية وقابلة للتوثيق؛ لا يخمّن رقماً أبداً ولا ينفّذ أي إجراء كتابة فوراً.",
      tr: "Yöneticilerin iş sorularını (satış, kâr, alacaklar, envanter, şubeler, bütçe vb.) gerçek ve kanıtlanabilir verilerle yanıtlar; asla bir sayıyı tahmin etmez ve hiçbir yazma işlemini anında yürütmez.",
      en: "Answers managers' business questions (sales, profit, receivables, inventory, branches, budget, etc.) with real, evidence-backed data — it never guesses a figure and never executes a write action immediately.",
    },
    mainActions: {
      fa: ["پرسیدن سوال به فارسی/عربی/ترکی/انگلیسی", "مشاهده جزئیات و منبع هر پاسخ", "استفاده از پیشنهادها یا خلاصه امروز", "بازنشانی گفتگو", "اتصال شماره تلگرام برای پرسیدن سوال از آنجا"],
      ar: ["طرح سؤال بالفارسية/العربية/التركية/الإنجليزية", "عرض التفاصيل ومصدر كل إجابة", "استخدام الاقتراحات أو ملخص اليوم", "إعادة تعيين المحادثة", "ربط حساب تيليجرام للسؤال من هناك"],
      tr: ["Farsça/Arapça/Türkçe/İngilizce soru sorun", "Her yanıtın ayrıntılarını ve kaynağını görüntüleyin", "Önerileri veya günlük özeti kullanın", "Görüşmeyi sıfırlayın", "Oradan soru sormak için Telegram hesabını bağlayın"],
      en: ["Ask a question in Persian/Arabic/Turkish/English", "View the details and source behind each answer", "Use suggestions or the daily summary", "Reset the conversation", "Bind a Telegram chat to ask questions from there"],
    },
    keyFields: {
      fa: ["وضعیت STT/TTS/هوش مصنوعی زبانی همیشه صادقانه نمایش داده می‌شود", "پاسخ‌ها فقط بر اساس نقش و شرکت فعال کاربر است"],
      ar: ["حالة تحويل الصوت/النص والذكاء اللغوي تُعرض دائماً بصدق", "الإجابات تقتصر فقط على دور المستخدم وشركته الحالية"],
      tr: ["STT/TTS/dil yapay zekası durumu her zaman dürüstçe gösterilir", "Yanıtlar yalnızca kullanıcının rolü ve aktif şirketiyle sınırlıdır"],
      en: ["STT/TTS/language-AI status is always shown honestly", "Answers are always scoped to the user's role and active company"],
    },
    warnings: {
      fa: ["دستیار هرگز درخواستی مانند «پیام یادآوری بفرست» را بی‌درنگ اجرا نمی‌کند؛ آن را به یک درخواست تغییر پیش‌نویس در مرکز درخواست‌های تغییر تبدیل می‌کند که نیاز به تأیید دارد.", "این بخش فقط برای نقش‌های مدیر و حسابدار در دسترس است."],
      ar: ["لن ينفّذ المساعد أبداً طلباً مثل «أرسل رسالة تذكير» فوراً؛ يحوّله إلى طلب تغيير مسودة في مركز طلبات التغيير يتطلب الموافقة.", "هذا القسم متاح فقط لأدوار المدير والمحاسب."],
      tr: ["Asistan «hatırlatma mesajı gönder» gibi bir isteği asla anında yürütmez; onay gerektiren taslak bir Değişiklik İsteği'ne dönüştürür.", "Bu bölüm yalnızca yönetici ve muhasebeci rolleri için kullanılabilir."],
      en: ["The agent never executes a request like \"send a reminder message\" immediately — it turns it into a draft Change Request that needs approval.", "This area is only available to admin and accountant roles."],
    },
  }),
  backupRecovery: entry({
    title: { fa: "پشتیبان‌گیری و بازیابی", ar: "النسخ الاحتياطي والاستعادة", tr: "Yedekleme ve Kurtarma", en: "Backup & Recovery" },
    purpose: {
      fa: "ساخت/بازیابی پشتیبان دیتابیس با بررسی سلامت، و تعریف سیاست‌های تحویل خودکار به ایمیل/تلگرام/واتس‌اپ یا لینک امن دانلود.",
      ar: "إنشاء/استعادة نسخة احتياطية للقاعدة مع فحص السلامة، وتحديد سياسات تسليم تلقائي عبر البريد/تيليجرام/واتساب أو رابط تنزيل آمن.",
      tr: "Bütünlük kontrolüyle veritabanı yedeği oluşturun/geri yükleyin ve e-posta/Telegram/WhatsApp veya güvenli indirme linkine otomatik teslim politikaları tanımlayın.",
      en: "Create/restore database backups with integrity checks, and define automated delivery policies to email/Telegram/WhatsApp or a secure download link.",
    },
    mainActions: {
      fa: ["ساخت بکاپ دستی", "آزمایش بازیابی قبل از بازیابی واقعی", "تعریف سیاست تحویل خودکار", "اجرای فوری یک سیاست"],
      ar: ["إنشاء نسخة احتياطية يدوية", "اختبار الاستعادة قبل الاستعادة الفعلية", "تحديد سياسة تسليم تلقائي", "تشغيل سياسة فورًا"],
      tr: ["Manuel yedek oluştur", "Gerçek geri yüklemeden önce test et", "Otomatik teslim politikası tanımla", "Bir politikayı hemen çalıştır"],
      en: ["Create a manual backup", "Rehearse a restore before the real one", "Define an automated delivery policy", "Run a policy immediately"],
    },
    keyFields: { fa: ["گیرندگان تحویل (ایمیل/تلگرام/واتس‌اپ/لینک امن)"], ar: ["مستلمو التسليم"], tr: ["Teslimat alıcıları"], en: ["Delivery recipients (email/Telegram/WhatsApp/secure link)"] },
    warnings: {
      fa: ["بدون اجرای یک فرآیند پس‌زمینه یا فراخوانی خارجی زمان‌بندی‌شده، تحویل فقط با ترافیک واقعی برنامه اجرا می‌شود؛ برای اجرای دقیق در زمان تعیین‌شده باید یک وظیفه زمان‌بندی خارجی (Task Scheduler/cron) تنظیم شود."],
      ar: ["بدون عملية خلفية أو استدعاء خارجي مجدول، لا يعمل التسليم إلا مع حركة مرور حقيقية للتطبيق؛ للتشغيل الدقيق في الوقت المحدد يلزم إعداد مجدول خارجي."],
      tr: ["Bir arka plan süreci veya zamanlanmış dış çağrı olmadan, teslimat yalnızca gerçek uygulama trafiğiyle çalışır; tam zamanında çalıştırmak için harici bir zamanlayıcı (Task Scheduler/cron) kurulmalıdır."],
      en: ["Without a background worker process or a scheduled external call, delivery only fires on real app traffic; for exact on-time execution, an external scheduler (Task Scheduler/cron) must be configured."],
    },
  }),
  dataImport: entry({
    title: { fa: "ورود هوشمند اطلاعات", ar: "استيراد ذكي للبيانات", tr: "Akıllı Veri İçe Aktarma", en: "Smart Data Import" },
    purpose: {
      fa: "ورود گروهی طرف‌حساب، کالا، سند افتتاحیه، فاکتور تاریخی یا پرسنل از فایل Excel یا CSV، با نگاشت ستون خودکار و درصد اطمینان.",
      ar: "استيراد جماعي للأطراف أو المنتجات أو القيد الافتتاحي أو الفواتير السابقة أو الموظفين من ملف Excel أو CSV، مع تخطيط أعمدة تلقائي ونسبة ثقة.",
      tr: "Excel veya CSV dosyasından cari, ürün, açılış kaydı, geçmiş fatura veya personel için otomatik sütun eşlemesi ve güven yüzdesiyle toplu içe aktarma.",
      en: "Bulk-import parties, products, opening balances, historical invoices, or employees from an Excel or CSV file, with automatic column mapping and a confidence score.",
    },
    mainActions: {
      fa: ["آپلود فایل Excel یا CSV", "بررسی/اصلاح نگاشت ستون‌ها", "پیش‌نمایش و رفع خطا", "تأیید و ثبت نهایی"],
      ar: ["رفع ملف Excel أو CSV", "مراجعة/تعديل تخطيط الأعمدة", "المعاينة وإصلاح الأخطاء", "التأكيد والتطبيق النهائي"],
      tr: ["Excel veya CSV dosyası yükle", "Sütun eşlemesini incele/düzelt", "Önizle ve hataları düzelt", "Onayla ve son kez uygula"],
      en: ["Upload an Excel or CSV file", "Review/adjust the column mapping", "Preview and fix errors", "Confirm and apply"],
    },
    keyFields: {
      fa: ["درصد اطمینان نگاشت (قاعده‌محور، نه هوش مصنوعی)", "سیاست تکراری (رد/به‌روزرسانی)"],
      ar: ["نسبة ثقة التخطيط (قائمة على قواعد، وليست ذكاء اصطناعي)", "سياسة التكرار"],
      tr: ["Eşleme güven yüzdesi (kural tabanlı, yapay zeka değil)", "Yinelenen ilkesi"],
      en: ["Mapping confidence score (rule-based, not AI)", "Duplicate policy (skip/update)"],
    },
    warnings: {
      fa: ["همیشه پیش‌نمایش را قبل از اعمال نهایی بررسی کنید.", "PDF اسکن‌شده پشتیبانی نمی‌شود؛ فایل را به Excel یا CSV تبدیل کنید."],
      ar: ["راجع دائمًا المعاينة قبل التطبيق النهائي.", "ملفات PDF الممسوحة ضوئيًا غير مدعومة؛ حوّل الملف إلى Excel أو CSV."],
      tr: ["Her zaman son uygulamadan önce önizlemeyi kontrol edin.", "Taranmış PDF desteklenmez; dosyayı Excel veya CSV'ye dönüştürün."],
      en: ["Always check the preview before the final apply.", "Scanned PDF files are not supported — convert the file to Excel or CSV instead."],
    },
  }),
  systemHealth: entry({
    title: { fa: "سلامت سیستم", ar: "سلامة النظام", tr: "Sistem Sağlığı", en: "System Health" },
    purpose: { fa: "مرور وضعیت فنی سرویس‌ها و پیکربندی‌های حیاتی.", ar: "مراجعة الحالة الفنية للخدمات والإعدادات الحرجة.", tr: "Kritik servis ve yapılandırmaların teknik durumunu inceleyin.", en: "Review the technical status of services and critical configuration." },
    mainActions: { fa: ["مرور بررسی‌های سلامت گروه‌بندی‌شده"], ar: ["مراجعة فحوصات السلامة المصنّفة"], tr: ["Gruplanmış sağlık kontrollerini incele"], en: ["Review grouped health checks"] },
    keyFields: { fa: [], ar: [], tr: [], en: [] }, warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  financialPolicy: entry({
    title: { fa: "سیاست مالی", ar: "السياسة المالية", tr: "Mali Politika", en: "Financial Policy" },
    purpose: { fa: "تنظیم واحد پول، روش گردکردن، تقویم و سایر سیاست‌های حسابداری شرکت.", ar: "ضبط العملة وطريقة التقريب والتقويم وسياسات محاسبية أخرى.", tr: "Para birimi, yuvarlama yöntemi, takvim ve diğer muhasebe politikalarını ayarlayın.", en: "Set currency, rounding mode, calendar, and other company accounting policies." },
    mainActions: { fa: ["ویرایش سیاست فعلی", "مشاهده تاریخچه تغییرات"], ar: ["تعديل السياسة الحالية", "عرض سجل التغييرات"], tr: ["Mevcut politikayı düzenle", "Değişiklik geçmişini görüntüle"], en: ["Edit the current policy", "View change history"] },
    keyFields: { fa: [], ar: [], tr: [], en: [] },
    warnings: { fa: ["تغییر سیاست مالی روی محاسبات آینده اثر می‌گذارد؛ با احتیاط انجام شود."], ar: ["تغيير السياسة المالية يؤثر على الحسابات المستقبلية؛ يُنفَّذ بحذر."], tr: ["Mali politika değişikliği gelecekteki hesaplamaları etkiler; dikkatle yapılmalıdır."], en: ["Changing financial policy affects future calculations — proceed carefully."] },
  }),
  designStudio: entry({
    title: { fa: "استودیو طراحی", ar: "استوديو التصميم", tr: "Tasarım Stüdyosu", en: "Design Studio" },
    purpose: { fa: "مرکز مرکزی قالب‌های فاکتور، کارت ویزیت، سربرگ و بنر.", ar: "المركز المركزي لقوالب الفواتير وبطاقات العمل والترويسة واللافتات.", tr: "Fatura, kartvizit, antetli kağıt ve afiş şablonlarının merkezi.", en: "Central hub for invoice, business-card, letterhead, and banner templates." },
    mainActions: { fa: ["ساخت قالب جدید", "ویرایش/کپی/تغییر نام قالب"], ar: ["إنشاء قالب جديد", "تعديل/نسخ/إعادة تسمية القالب"], tr: ["Yeni şablon oluştur", "Şablonu düzenle/kopyala/yeniden adlandır"], en: ["Create a new template", "Edit/duplicate/rename a template"] },
    keyFields: { fa: [], ar: [], tr: [], en: [] }, warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  messageTemplates: entry({
    title: { fa: "قالب‌های پیام", ar: "قوالب الرسائل", tr: "Mesaj Şablonları", en: "Message Templates" },
    purpose: { fa: "ویرایش متن پیام‌های خودکار (یادآوری پرداخت، لینک فاکتور و...) به هر زبان.", ar: "تعديل نص الرسائل التلقائية بكل لغة.", tr: "Otomatik mesajların (ödeme hatırlatma, fatura bağlantısı vb.) her dildeki metnini düzenleyin.", en: "Edit the text of automated messages (payment reminders, invoice links, etc.) per language." },
    mainActions: { fa: ["ویرایش قالب برای یک زبان/کانال"], ar: ["تعديل قالب للغة/قناة"], tr: ["Dil/kanal için şablon düzenle"], en: ["Edit a template for a language/channel"] },
    keyFields: { fa: [], ar: [], tr: [], en: [] }, warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  settings: entry({
    title: { fa: "تنظیمات", ar: "الإعدادات", tr: "Ayarlar", en: "Settings" },
    purpose: { fa: "تنظیمات کلی شرکت: نام، لوگو، پیامک/تلگرام/واتس‌اپ، درگاه پرداخت.", ar: "الإعدادات العامة للشركة: الاسم، الشعار، الرسائل/تيليجرام/واتساب، بوابة الدفع.", tr: "Genel şirket ayarları: ad, logo, SMS/Telegram/WhatsApp, ödeme sağlayıcısı.", en: "General company settings: name, logo, SMS/Telegram/WhatsApp, payment gateway." },
    mainActions: { fa: ["ویرایش اطلاعات شرکت", "تنظیم اتصال پیام‌رسان‌ها و درگاه پرداخت"], ar: ["تعديل بيانات الشركة", "ضبط اتصال المراسلة وبوابة الدفع"], tr: ["Şirket bilgilerini düzenle", "Mesajlaşma ve ödeme bağlantısını ayarla"], en: ["Edit company info", "Configure messaging and payment connections"] },
    keyFields: { fa: [], ar: [], tr: [], en: [] }, warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
  accountSecurity: entry({
    title: { fa: "امنیت حساب", ar: "أمان الحساب", tr: "Hesap Güvenliği", en: "Account Security" },
    purpose: { fa: "تغییر رمز عبور و فعال‌سازی تأیید دومرحله‌ای.", ar: "تغيير كلمة المرور وتفعيل التحقق بخطوتين.", tr: "Şifre değiştirme ve iki adımlı doğrulamayı etkinleştirme.", en: "Change password and enable two-factor authentication." },
    mainActions: { fa: ["تغییر رمز عبور", "فعال‌سازی/غیرفعال‌سازی 2FA"], ar: ["تغيير كلمة المرور", "تفعيل/تعطيل التحقق بخطوتين"], tr: ["Şifreyi değiştir", "2FA'yı etkinleştir/devre dışı bırak"], en: ["Change password", "Enable/disable 2FA"] },
    keyFields: { fa: [], ar: [], tr: [], en: [] }, warnings: { fa: [], ar: [], tr: [], en: [] },
  }),
};

const FALLBACK_LANG = "en";

export function getPageHelp(key, language) {
  const entryData = pageHelp[key];
  if (!entryData) return null;
  const pick = (field) => entryData[field]?.[language] ?? entryData[field]?.[FALLBACK_LANG] ?? (Array.isArray(entryData[field]?.[FALLBACK_LANG]) ? [] : "");
  return {
    title: pick("title"),
    purpose: pick("purpose"),
    mainActions: pick("mainActions") || [],
    keyFields: pick("keyFields") || [],
    warnings: pick("warnings") || [],
    workflow: pick("workflow") || [],
  };
}

export function hasPageHelp(key) {
  return Boolean(pageHelp[key]);
}
