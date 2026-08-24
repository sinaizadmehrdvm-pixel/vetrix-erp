import { useMemo, useState } from "react";
import { LifeBuoy, Search, ChevronDown } from "lucide-react";
import { useLanguage } from "../localization/useLanguage";

const L = { fa: 0, ar: 1, tr: 2, en: 3 };

function t(strings) {
  return (lang) => strings[L[lang]];
}

const SECTIONS = [
  {
    id: "dashboard",
    title: t(["داشبورد", "لوحة التحكم", "Panel", "Dashboard"]),
    body: t([
      ["نمای کلی فروش، موجودی و وضعیت مالی شرکت را نشان می‌دهد.",
       "امتیاز سلامت کسب‌وکار همینجا و در بخش هوش تجاری محاسبه می‌شود؛ چون از دو بازه‌ی زمانی متفاوت استفاده می‌کنند ممکن است عدد کمی متفاوت باشد، ولی هر دو از روی داده‌های واقعی حساب می‌شوند.",
       "ویجت‌های فاکتورهای اخیر و پرفروش‌ترین محصولات قابل کلیک هستند و مستقیم به صفحه‌ی مربوطه می‌روند."],
      ["يعرض نظرة عامة على المبيعات والمخزون والوضع المالي للشركة.",
       "يُحسب مؤشر صحة الأعمال هنا وفي قسم ذكاء الأعمال؛ نظرًا لاختلاف الفترات الزمنية قد يختلف الرقم قليلًا لكن كلاهما مبني على بيانات حقيقية.",
       "أدوات آخر الفواتير والمنتجات الأكثر مبيعًا قابلة للنقر وتنقلك مباشرة إلى الصفحة المعنية."],
      ["Şirketin satış, stok ve mali durumuna genel bakış sağlar.",
       "İşletme sağlık puanı burada ve Yapay Zeka İş Zekası bölümünde hesaplanır; farklı zaman aralıkları kullanıldığından sayı hafifçe farklı olabilir, ancak ikisi de gerçek verilere dayanır.",
       "Son faturalar ve en çok satan ürünler widget'ları tıklanabilir ve ilgili sayfaya götürür."],
      ["Shows an overview of sales, inventory, and the company's financial state.",
       "The Business Health Score is calculated here and in AI Business Intelligence; since they use different time windows the number can differ slightly, but both are computed from real data.",
       "The Recent Invoices and Top Products widgets are clickable and jump straight to the relevant page."],
    ]),
  },
  {
    id: "customersCrm",
    title: t(["مشتریان و CRM", "العملاء وإدارة العلاقات", "Müşteriler ve CRM", "Customers & CRM"]),
    body: t([
      ["از «مشتریان» می‌توانید مشتری بسازید، ویرایش کنید و وارد پروندهٔ ۳۶۰ درجه (تاریخچهٔ کامل خرید و تعامل) شوید.",
       "«پایپ‌لاین فروش» مراحل معامله (سرنخ تا بستن قرارداد) را به‌صورت کارت‌های قابل جابه‌جایی نشان می‌دهد.",
       "«ماژول ویزیتور» یک نمای موبایلی جداگانه برای بازاریاب‌های میدانی است که می‌توانند سفارش ثبت کنند و بازدید مشتری را ضبط کنند."],
      ["من «العملاء» يمكنك إنشاء عميل وتعديله والدخول إلى ملف 360 درجة (سجل كامل للشراء والتفاعل).",
       "يعرض «مسار المبيعات» مراحل الصفقة (من العميل المحتمل حتى إغلاق الصفقة) كبطاقات قابلة للسحب.",
       "«وحدة المندوب الميداني» واجهة منفصلة للجوال لمندوبي المبيعات الميدانيين لتسجيل الطلبات وزيارات العملاء."],
      ["«Müşteriler»den müşteri oluşturabilir, düzenleyebilir ve 360 derece dosyaya (tam satın alma ve etkileşim geçmişi) girebilirsiniz.",
       "«Satış Hattı» anlaşma aşamalarını (adaydan anlaşmanın kapanmasına) sürüklenebilir kartlar olarak gösterir.",
       "«Saha Satış Modülü» saha satış temsilcileri için sipariş girme ve müşteri ziyareti kaydetmeye yönelik ayrı bir mobil arayüzdür."],
      ["From Customers you can create/edit a customer and open their 360° file (full purchase and interaction history).",
       "Sales Pipeline shows deal stages (lead to close) as draggable cards.",
       "The Visitor module is a separate mobile-first view for field sales reps to place orders and log customer visits."],
    ]),
  },
  {
    id: "productsInventory",
    title: t(["محصولات و انبار", "المنتجات والمخزون", "Ürünler ve Envanter", "Products & Inventory"]),
    body: t([
      ["ستون‌های جدول «محصولات» مثل صفحهٔ مشتریان قابل مرتب‌سازی و فیلتر هستند.",
       "«دسته‌بندی محصولات» هم اکنون قابلیت ویرایش دارد، نه فقط حذف.",
       "«انبار» موجودی هر انبار را جدا نشان می‌دهد؛ «انبارهای چندگانه» برای شرکت‌هایی با چند شعبه/انبار است.",
       "«سفارش‌های خرید» و «قیمت‌گذاری پلکانی» (تخفیف بر اساس حجم/گروه مشتری) هم از همین بخش مدیریت می‌شوند."],
      ["أعمدة جدول «المنتجات» قابلة للفرز والتصفية مثل صفحة العملاء.",
       "أصبح بالإمكان الآن تعديل «فئات المنتجات» وليس الحذف فقط.",
       "«المخزون» يعرض رصيد كل مستودع بشكل منفصل؛ «المستودعات المتعددة» للشركات ذات الفروع/المستودعات المتعددة.",
       "تُدار «أوامر الشراء» و«التسعير المتدرج» (خصم حسب الكمية/فئة العميل) من نفس القسم."],
      ["«Ürünler» tablosu sütunları Müşteriler sayfası gibi sıralanabilir ve filtrelenebilir.",
       "«Ürün Kategorileri» artık sadece silinebilir değil, düzenlenebilir de.",
       "«Depo» her deponun stokunu ayrı gösterir; «Çoklu Depo» birden fazla şube/deposu olan şirketler içindir.",
       "«Satın Alma Siparişleri» ve «Kademeli Fiyatlandırma» (hacme/müşteri grubuna göre indirim) da bu bölümden yönetilir."],
      ["The Products table columns are sortable and filterable, just like the Customers page.",
       "Product Categories can now be edited, not just deleted.",
       "Warehouse shows each warehouse's stock separately; Multi-Warehouse is for companies with several branches/warehouses.",
       "Purchase Orders and Tiered Pricing (volume/customer-group discounts) are also managed from this area."],
    ]),
  },
  {
    id: "invoicesPayments",
    title: t(["فاکتور و پرداخت", "الفواتير والدفع", "Fatura ve Ödeme", "Invoices & Payments"]),
    body: t([
      ["هنگام ثبت فاکتور می‌توانید همزمان پرداخت دریافت کنید: نقد، کارت، حواله، چک یا ترکیبی از چند روش در یک فاکتور.",
       "چک تا زمانی که در «چک و خزانه» به وضعیت «وصول‌شده» تغییر نکند، جزو مبلغ قطعی‌شدهٔ فاکتور حساب نمی‌شود؛ اگر چک برگشت بخورد، مانده فاکتور دوباره باز می‌شود.",
       "ابطال یا استرداد یک پرداخت نیاز به تأیید یک کاربر دیگر دارد (خودِ ثبت‌کننده نمی‌تواند تأیید کند) و از «مرکز تأییدیه‌ها» انجام می‌شود.",
       "فاکتورها هرگز حذف فیزیکی نمی‌شوند؛ ابطال همیشه با ثبت سند برگشت انجام می‌شود تا سابقهٔ حسابداری دست‌نخورده بماند.",
       "دکمهٔ چاپ فاکتور شامل QR کد قابل اسکن برای تأیید اصالت فاکتور است.",
       "در صفحهٔ «یادآوری پرداخت»، دکمهٔ «لینک پرداخت» یک لینک امن و اختصاصی برای پرداخت آنلاین همان فاکتور می‌سازد، آن را کپی می‌کند و واتساپ را با متن آماده باز می‌کند؛ چون کپی شده، در هر پیام‌رسان یا پیامک دیگری هم قابل ارسال است. دکمهٔ «پیامک» همان لینک را مستقیماً پیامک می‌کند (نیاز به تنظیم پنل پیامک در «تنظیمات» دارد)."],
      ["عند إنشاء فاتورة يمكنك تحصيل الدفع في نفس الوقت: نقدًا، بطاقة، حوالة، شيك، أو مزيج من عدة طرق في فاتورة واحدة.",
       "لا يُحتسب الشيك ضمن المبلغ المؤكد للفاتورة حتى يتغير وضعه إلى «تم التحصيل» في «الشيكات والخزينة»؛ إذا ارتد الشيك يُعاد فتح رصيد الفاتورة.",
       "إبطال أو استرداد دفعة يتطلب موافقة مستخدم آخر (لا يمكن للمُنشئ نفسه الموافقة) ويتم من «مركز الموافقات».",
       "لا تُحذف الفواتير فعليًا أبدًا؛ يتم الإبطال دائمًا بقيد عكسي للحفاظ على سجل محاسبي سليم.",
       "يحتوي زر طباعة الفاتورة على رمز QR قابل للمسح للتحقق من صحة الفاتورة.",
       "في صفحة «تذكيرات الدفع»، ينشئ زر «رابط الدفع» رابط دفع آمن وخاص بهذه الفاتورة، وينسخه، ويفتح واتساب برسالة جاهزة؛ وبما أنه منسوخ يمكن إرساله عبر أي تطبيق مراسلة أو رسالة نصية أخرى. زر «رسالة نصية» يرسل نفس الرابط مباشرة عبر SMS (يتطلب إعداد لوحة الرسائل في «الإعدادات»)."],
      ["Fatura oluştururken aynı anda ödeme de tahsil edebilirsiniz: nakit, kart, havale, çek veya tek faturada birkaç yöntemin karışımı.",
       "Bir çek, «Çek ve Hazine»de «tahsil edildi» durumuna geçmedikçe faturanın kesinleşmiş tutarına dahil edilmez; çek karşılıksız çıkarsa fatura bakiyesi yeniden açılır.",
       "Bir ödemeyi iptal etmek veya iade etmek başka bir kullanıcının onayını gerektirir (kaydı yapan kişi onaylayamaz) ve «Onay Merkezi»nden yapılır.",
       "Faturalar asla fiziksel olarak silinmez; iptal her zaman ters kayıtla yapılır, böylece muhasebe geçmişi bozulmaz.",
       "Fatura yazdırma, faturanın gerçekliğini doğrulamak için taranabilir bir QR kod içerir.",
       "«Ödeme Hatırlatmaları» sayfasında «Ödeme bağlantısı» düğmesi bu fatura için güvenli, özel bir çevrimiçi ödeme bağlantısı oluşturur, kopyalar ve hazır metinle WhatsApp'ı açar; kopyalandığı için başka herhangi bir mesajlaşma uygulaması veya SMS ile de gönderilebilir. «SMS» düğmesi aynı bağlantıyı doğrudan SMS ile gönderir («Ayarlar»da SMS paneli kurulumu gerektirir)."],
      ["When creating an invoice you can collect payment at the same time: cash, card, transfer, cheque, or a mix of several methods on one invoice.",
       "A cheque isn't counted toward the invoice's confirmed amount until it's marked 'cleared' in Treasury & Cheques; if it bounces, the invoice balance reopens.",
       "Voiding or refunding a payment requires approval from a different user (the creator can't self-approve) and is handled from the Approval Center.",
       "Invoices are never physically deleted — voids always post a reversing entry so accounting history stays intact.",
       "The invoice print includes a scannable QR code to verify the invoice's authenticity.",
       "On the Payment Reminders page, the 'Payment link' button generates a secure, invoice-specific online payment link, copies it, and opens WhatsApp with a ready message; since it's copied, it can be sent through any other messenger or SMS too. The 'SMS' button sends that same link directly via SMS (requires SMS panel setup in Settings)."],
    ]),
  },
  {
    id: "remindersTemplates",
    title: t(["یادآوری پرداخت و قالب‌های پیام", "تذكيرات الدفع وقوالب الرسائل", "Ödeme Hatırlatmaları ve Mesaj Şablonları", "Payment Reminders & Message Templates"]),
    body: t([
      ["«یادآوری پرداخت» به‌صورت خودکار برای فاکتورهای معوق پیام یادآوری می‌فرستد (طبق فاصلهٔ زمانی تعریف‌شده در تنظیمات).",
       "متن پیام‌هایی که برای مشتری ارسال می‌شود (یادآوری، تأیید سفارش و ...) از صفحهٔ «قالب‌های پیام» برای هر زبان قابل ویرایش است.",
       "مدیر می‌تواند از همین صفحه به کاربران دیگر اجازهٔ ویرایش قالب‌ها را بدهد، بدون این‌که نقش آن‌ها را تغییر دهد."],
      ["يرسل «تذكير الدفع» تلقائيًا رسائل تذكير للفواتير المتأخرة (وفق الفاصل الزمني المحدد في الإعدادات).",
       "نص الرسائل المرسلة للعميل (تذكير، تأكيد طلب، إلخ) قابل للتعديل لكل لغة من صفحة «قوالب الرسائل».",
       "يمكن للمدير من نفس الصفحة منح مستخدمين آخرين صلاحية تعديل القوالب دون تغيير دورهم."],
      ["«Ödeme Hatırlatmaları» gecikmiş faturalar için otomatik olarak hatırlatma mesajı gönderir (ayarlarda tanımlanan aralığa göre).",
       "Müşteriye gönderilen mesaj metinleri (hatırlatma, sipariş onayı vb.) «Mesaj Şablonları» sayfasından her dil için düzenlenebilir.",
       "Yönetici aynı sayfadan, rollerini değiştirmeden diğer kullanıcılara şablon düzenleme izni verebilir."],
      ["Payment Reminders automatically sends reminder messages for overdue invoices (per the interval set in Settings).",
       "The text sent to customers (reminders, order confirmations, etc.) is editable per language from Message Templates.",
       "The admin can grant other users template-editing access from that same page, without changing their role."],
    ]),
  },
  {
    id: "accounting",
    title: t(["حسابداری", "المحاسبة", "Muhasebe", "Accounting"]),
    body: t([
      ["«اسناد حسابداری» دفتر کل و ثبت سند دستی، «دوره‌های مالی» قفل/باز کردن ماه‌های بسته‌شده را مدیریت می‌کند.",
       "«مغایرت بانکی»، «چک و خزانه»، «مدیریت ارز»، «مالیات» و «بودجه و کنترل» هر کدام زیرمجموعهٔ مستقل حسابداری هستند.",
       "«دارایی‌های ثابت» استهلاک را محاسبه و ثبت می‌کند.",
       "پس از بستن یک دورهٔ مالی، هیچ سند جدیدی (از جمله ابطال پرداخت) برای آن دوره ثبت نمی‌شود."],
      ["«القيود المحاسبية» تدير دفتر الأستاذ العام والقيد اليدوي، و«الفترات المالية» تدير قفل/فتح الأشهر المُغلقة.",
       "«التسوية البنكية» و«الشيكات والخزينة» و«إدارة العملات» و«الضرائب» و«الميزانية والتحكم» أقسام محاسبية مستقلة.",
       "«الأصول الثابتة» تحسب وتسجل الإهلاك.",
       "بعد إغلاق فترة مالية، لا يُسجَّل أي قيد جديد (بما في ذلك إبطال دفعة) لتلك الفترة."],
      ["«Muhasebe Kayıtları» genel defteri ve manuel kayıt girişini, «Mali Dönemler» kapatılmış ayların kilitlenmesini/açılmasını yönetir.",
       "«Banka Mutabakatı», «Çek ve Hazine», «Döviz Yönetimi», «Vergi» ve «Bütçe Kontrolü» bağımsız muhasebe alt bölümleridir.",
       "«Sabit Kıymetler» amortismanı hesaplar ve kaydeder.",
       "Bir mali dönem kapatıldıktan sonra o dönem için yeni kayıt (ödeme iptali dahil) yapılamaz."],
      ["Accounting Entries manages the general ledger and manual journal entries; Fiscal Periods manages locking/unlocking closed months.",
       "Bank Reconciliation, Treasury & Cheques, Currency Management, Tax, and Budget Control are each independent accounting sub-areas.",
       "Fixed Assets calculates and posts depreciation.",
       "Once a fiscal period is closed, no new entry (including a payment void) can post against it."],
    ]),
  },
  {
    id: "reportsAi",
    title: t(["گزارش‌ها و هوش تجاری", "التقارير وذكاء الأعمال", "Raporlar ve İş Zekası", "Reports & AI-BI"]),
    body: t([
      ["«گزارش‌ها» گزارش‌های مالی و فروش استاندارد را می‌سازد.",
       "«هوش تجاری» شامل پیش‌بینی جریان نقدی، تشخیص ناهنجاری در تراکنش‌ها و امتیاز سلامت کسب‌وکار است.",
       "«صورت‌های مالی» و «گزارش سنی مطالبات» هم از بخش حسابداری در دسترس‌اند."],
      ["ينشئ «التقارير» تقارير مالية ومبيعات قياسية.",
       "يشمل «ذكاء الأعمال» توقع التدفق النقدي واكتشاف الشذوذ في المعاملات ومؤشر صحة الأعمال.",
       "«القوائم المالية» و«تقرير أعمار الذمم» متاحان أيضًا من قسم المحاسبة."],
      ["«Raporlar» standart mali ve satış raporları oluşturur.",
       "«İş Zekası» nakit akışı tahmini, işlemlerde anormallik tespiti ve işletme sağlık puanını içerir.",
       "«Mali Tablolar» ve «Alacak Yaşlandırma Raporu» da muhasebe bölümünden erişilebilir."],
      ["Reports builds standard financial and sales reports.",
       "AI Business Intelligence includes cashflow forecasting, transaction anomaly detection, and the business health score.",
       "Financial Statements and the Aging Report are also available from the accounting section."],
    ]),
  },
  {
    id: "approvals",
    title: t(["تأییدیه‌ها و درخواست تغییر صوتی", "الموافقات وطلب التغيير الصوتي", "Onaylar ve Sesli Değişiklik Talebi", "Approvals & Voice Change Requests"]),
    body: t([
      ["«مرکز تأییدیه» درخواست‌های در انتظار (مثل ابطال پرداخت) را نشان می‌دهد و اجازهٔ تأیید/رد می‌دهد.",
       "«مرکز درخواست تغییر صوتی» به شما اجازه می‌دهد با متن یا صدا درخواستی بسازید (مثلاً افزودن یک کانال پیام‌رسان جدید برای یادآوری‌ها) که پس از تأیید یک نفر دیگر اعمال می‌شود."],
      ["يعرض «مركز الموافقات» الطلبات المعلقة (مثل إبطال دفعة) ويتيح الموافقة/الرفض.",
       "يتيح لك «مركز طلب التغيير الصوتي» إنشاء طلب بالنص أو الصوت (مثل إضافة قناة مراسلة جديدة للتذكيرات) يُطبَّق بعد موافقة شخص آخر."],
      ["«Onay Merkezi» bekleyen talepleri (örn. ödeme iptali) gösterir ve onay/red vermenizi sağlar.",
       "«Sesli Değişiklik Talebi Merkezi» metin veya sesle bir talep oluşturmanıza olanak tanır (örn. hatırlatmalar için yeni bir mesajlaşma kanalı eklemek); bu, başka biri onayladıktan sonra uygulanır."],
      ["The Approval Center shows pending requests (e.g. a payment void) and lets you approve/reject.",
       "The Voice Change Request Center lets you create a request by text or voice (e.g. adding a new messaging channel for reminders) that applies once a different person approves it."],
    ]),
  },
  {
    id: "catalogDesigner",
    title: t(["کاتالوگ دیجیتال و طراح اسناد", "الكتالوج الرقمي ومصمم المستندات", "Dijital Katalog ve Belge Tasarımcısı", "Digital Catalog & Document Designer"]),
    body: t([
      ["«مدیریت کاتالوگ» یک کاتالوگ آنلاین قابل اشتراک‌گذاری با QR می‌سازد؛ مشتری می‌تواند ببیند و سفارش ثبت کند، ولی نمی‌تواند چیزی را ویرایش کند.",
       "تخفیف‌هایی که برای فروش آنلاین تعریف می‌کنید همان‌جا روی کاتالوگ هم نمایش داده می‌شود.",
       "«طراح فاکتور»، «طراح کارت‌ویزیت»، «طراح سربرگ» و «طراح بنر» یک بوم طراحی مشترک (درگ‌اند‌دراپ) دارند؛ هرکدام خروجی PDF مخصوص خودش را می‌سازد."],
      ["يُنشئ «إدارة الكتالوج» كتالوجًا عبر الإنترنت قابلًا للمشاركة برمز QR؛ يمكن للعميل التصفح والطلب لكن لا يمكنه تعديل أي شيء.",
       "الخصومات المُعرَّفة للبيع عبر الإنترنت تظهر أيضًا في الكتالوج مباشرة.",
       "«مصمم الفاتورة» و«مصمم بطاقة العمل» و«مصمم الترويسة» و«مصمم البانر» يشتركون في لوحة تصميم واحدة (سحب وإفلات)؛ كل منها ينتج ملف PDF خاص به."],
      ["«Katalog Yönetimi» QR ile paylaşılabilir çevrimiçi bir katalog oluşturur; müşteri görüntüleyip sipariş verebilir ama hiçbir şeyi düzenleyemez.",
       "Çevrimiçi satış için tanımladığınız indirimler doğrudan katalogda da görünür.",
       "«Fatura Tasarımcısı», «Kartvizit Tasarımcısı», «Antetli Kağıt Tasarımcısı» ve «Afiş Tasarımcısı» ortak bir sürükle-bırak tasarım tuvali paylaşır; her biri kendi PDF çıktısını üretir."],
      ["Catalog Manager builds a shareable online catalog with a QR code; customers can browse and order but can't edit anything.",
       "Discounts you define for online sales automatically show up on the catalog too.",
       "Invoice Designer, Business Card Designer, Letterhead Designer, and Banner Designer share one drag-and-drop canvas; each produces its own PDF."],
    ]),
  },
  {
    id: "dataImport",
    title: t(["وارد کردن اطلاعات از برنامهٔ دیگر", "استيراد البيانات من برنامج آخر", "Başka Bir Programdan Veri İçe Aktarma", "Data Import"]),
    body: t([
      ["«ایمپورت داده» فایل اکسل/CSV مشتریان، محصولات، تراز حساب‌ها یا فاکتورها را می‌خواند و پیش‌نمایش می‌دهد تا اشتباهی ثبت نشود.",
       "می‌توانید نگاشت ستون‌ها (کدام ستون فایل شما معادل کدام فیلد سیستم است) را به‌عنوان یک «قالب» ذخیره کنید تا دفعهٔ بعد نیازی به تنظیم دوباره نباشد."],
      ["يقرأ «استيراد البيانات» ملف Excel/CSV للعملاء أو المنتجات أو أرصدة الحسابات أو الفواتير ويعرض معاينة لتجنب الأخطاء.",
       "يمكنك حفظ تخطيط الأعمدة (أي عمود في ملفك يقابل أي حقل في النظام) كـ«قالب» لتجنب إعادة الضبط في المرة القادمة."],
      ["«Veri İçe Aktarma» müşteri, ürün, hesap bakiyesi veya fatura Excel/CSV dosyasını okur ve hata olmaması için önizleme gösterir.",
       "Sütun eşlemesini (dosyanızdaki hangi sütunun sistemdeki hangi alana karşılık geldiği) bir «şablon» olarak kaydedebilir, bir dahaki sefere yeniden ayarlamaya gerek kalmaz."],
      ["Data Import reads a customers/products/trial-balance/invoices Excel or CSV file and shows a preview so nothing gets imported by mistake.",
       "You can save the column mapping (which column in your file matches which system field) as a template so you don't have to redo it next time."],
    ]),
  },
  {
    id: "settingsComms",
    title: t(["تنظیمات: ایمیل، پیامک و پشتیبان‌گیری", "الإعدادات: البريد والرسائل النصية والنسخ الاحتياطي", "Ayarlar: E-posta, SMS ve Yedekleme", "Settings: Email, SMS & Backup"]),
    body: t([
      ["برای فعال کردن ارسال ایمیل (یادآوری پرداخت، گزارش‌ها): در «تنظیمات» بخش SMTP، آدرس سرور، پورت، نام کاربری و رمز عبور ایمیل ارسال‌کننده را وارد کنید؛ اکثر ایمیل‌های شرکتی (مثل Gmail با App Password) پشتیبانی می‌شود.",
       "برای پنل پیامک باید یکی از سرویس‌دهنده‌های پیامکی را در همین بخش با کلید API فعال کنید؛ تا وقتی تنظیم نشود، پیامک ارسال نمی‌شود (فقط پیام‌رسان‌های لینکی مثل واتس‌اپ کار می‌کنند).",
       "زمان‌بندی پشتیبان‌گیری خودکار و پوشهٔ ذخیره از «پشتیبان‌گیری و بازیابی» قابل مشاهده و تغییر است؛ می‌توانید مقصد اضافه (ایمیل یا برنامهٔ دیگر) برای دریافت دورهٔ نسخهٔ پشتیبان تعریف کنید."],
      ["لتفعيل إرسال البريد الإلكتروني (تذكيرات الدفع، التقارير): في «الإعدادات» قسم SMTP أدخل عنوان الخادم والمنفذ واسم المستخدم وكلمة مرور بريد الإرسال؛ تُدعم معظم بيانات البريد المؤسسي (مثل Gmail بكلمة مرور تطبيق).",
       "لتفعيل لوحة الرسائل النصية يجب تفعيل أحد مزودي الرسائل في نفس القسم بمفتاح API؛ لن تُرسل الرسائل حتى يتم الإعداد (تعمل فقط الروابط اليدوية مثل واتساب).",
       "جدولة النسخ الاحتياطي التلقائي ومجلد الحفظ قابلان للعرض والتعديل من «النسخ الاحتياطي والاستعادة»؛ يمكنك إضافة وجهة (بريد أو تطبيق آخر) لاستلام نسخة احتياطية دوريًا."],
      ["E-posta göndermeyi (ödeme hatırlatmaları, raporlar) etkinleştirmek için: «Ayarlar»daki SMTP bölümünde sunucu adresi, port, kullanıcı adı ve gönderen e-posta şifresini girin; çoğu kurumsal e-posta (örn. Uygulama Şifreli Gmail) desteklenir.",
       "SMS panelini etkinleştirmek için aynı bölümde bir SMS sağlayıcısını API anahtarıyla etkinleştirmelisiniz; ayarlanana kadar SMS gönderilmez (yalnızca WhatsApp gibi bağlantı tabanlı mesajlaşma çalışır).",
       "Otomatik yedekleme zamanlaması ve kayıt klasörü «Yedekleme ve Kurtarma»dan görüntülenebilir ve değiştirilebilir; periyodik yedek almak için ek bir hedef (e-posta veya başka bir uygulama) tanımlayabilirsiniz."],
      ["To enable sending email (payment reminders, reports): in Settings' SMTP section, enter the server address, port, username, and password of the sending mailbox; most business email providers work (e.g. Gmail with an App Password).",
       "To enable the SMS panel you must activate one of the SMS providers in the same section with its API key; nothing sends until it's configured (only link-based messengers like WhatsApp work without it).",
       "The automatic backup schedule and storage folder are viewable/editable from Backup & Recovery; you can add a destination (email or another app) to periodically receive a copy of the backup."],
    ]),
  },
  {
    id: "usersSecurity",
    title: t(["کاربران، امنیت و شرکت‌ها", "المستخدمون والأمان والشركات", "Kullanıcılar, Güvenlik ve Şirketler", "Users, Security & Companies"]),
    body: t([
      ["«مدیریت کاربران» نقش هر کاربر (مدیر، حسابدار، انبار، فروش، بیننده) و دسترسی‌های مرتبط را تعیین می‌کند.",
       "«امنیت حساب کاربری» تغییر رمز عبور و تنظیمات امنیتی شخصی هر کاربر است.",
       "«مدیریت شرکت‌ها» (فقط برای مدیر ارشد/سوپرادمین) افزودن/ویرایش شرکت‌های جداگانه در یک نمونهٔ چندشرکتی است.",
       "«ثبت رویداد» (Audit Trail) تاریخچهٔ کامل تغییرات مهم را برای بازرسی نگه می‌دارد."],
      ["يحدد «إدارة المستخدمين» دور كل مستخدم (مدير، محاسب، مستودع، مبيعات، مشاهد) والصلاحيات المرتبطة به.",
       "«أمان الحساب» لتغيير كلمة المرور وإعدادات الأمان الشخصية لكل مستخدم.",
       "«إدارة الشركات» (للمدير العام فقط) لإضافة/تعديل شركات منفصلة ضمن نسخة متعددة الشركات.",
       "«سجل التدقيق» يحتفظ بسجل كامل للتغييرات المهمة للمراجعة."],
      ["«Kullanıcı Yönetimi» her kullanıcının rolünü (yönetici, muhasebeci, depo, satış, izleyici) ve ilgili izinleri belirler.",
       "«Hesap Güvenliği» her kullanıcının şifre değişikliği ve kişisel güvenlik ayarlarıdır.",
       "«Şirket Yönetimi» (yalnızca süper yönetici için) çok şirketli bir örnekte ayrı şirketler eklemek/düzenlemektir.",
       "«Denetim Kaydı» inceleme için önemli değişikliklerin tam geçmişini tutar."],
      ["User Management sets each user's role (admin, accountant, warehouse, sales, viewer) and the related permissions.",
       "Account Security is where each user changes their password and personal security settings.",
       "Company Management (super-admin only) adds/edits separate companies within a multi-company instance.",
       "Audit Trail keeps a full history of important changes for review."],
    ]),
  },
];

export default function HelpCenter() {
  const { language, dir } = useLanguage();
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState(SECTIONS[0].id);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter((s) => {
      const title = s.title(language).toLowerCase();
      const body = s.body(language).join(" ").toLowerCase();
      return title.includes(q) || body.includes(q);
    });
  }, [query, language]);

  const heading = { fa: "راهنما و مستندات", ar: "المساعدة والتوثيق", tr: "Yardım ve Belgeler", en: "Help & Documentation" }[language];
  const subtitle = {
    fa: "توضیح کامل هر بخش از برنامه را اینجا پیدا کنید. برای جست‌وجو در راهنما تایپ کنید.",
    ar: "اعثر هنا على شرح كامل لكل قسم من التطبيق. اكتب للبحث في المساعدة.",
    tr: "Uygulamanın her bölümünün tam açıklamasını burada bulun. Yardımda arama yapmak için yazın.",
    en: "Find a complete explanation of every part of the app here. Type to search the help content.",
  }[language];
  const searchPlaceholder = { fa: "جست‌وجو در راهنما...", ar: "بحث في المساعدة...", tr: "Yardımda ara...", en: "Search help..." }[language];
  const noResults = { fa: "چیزی پیدا نشد.", ar: "لم يُعثر على شيء.", tr: "Bir şey bulunamadı.", en: "Nothing found." }[language];

  return (
    <div dir={dir} className="p-4 md:p-6 space-y-6 text-[var(--erp-text)]">
      <div>
        <h1 className="text-2xl font-black flex items-center gap-2">
          <LifeBuoy className="text-[var(--erp-accent)]" />
          {heading}
        </h1>
        <p className="text-[var(--erp-muted)] mt-2">{subtitle}</p>
      </div>

      <div className="vitalix-input-group flex items-center gap-2 max-w-md" style={{ padding: "0 12px" }}>
        <Search className="w-4 h-4 text-[var(--erp-muted)] shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="min-w-0 flex-1 text-sm text-[var(--erp-text)]"
          style={{ padding: "10px 0" }}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-[var(--erp-muted)]">{noResults}</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((section) => {
            const isOpen = openId === section.id;
            return (
              <div key={section.id} className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-panel)] overflow-hidden">
                <button
                  onClick={() => setOpenId(isOpen ? null : section.id)}
                  className="w-full flex items-center justify-between gap-2 p-4 text-start font-black"
                >
                  {section.title(language)}
                  <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 space-y-2">
                    {section.body(language).map((line, i) => (
                      <p key={i} className="text-sm text-[var(--erp-muted)] leading-relaxed">
                        {line}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
