import { ExternalLink, Maximize2, PackageSearch, RefreshCw, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useLanguage } from "../localization/useLanguage";

const CATALOG_STUDIO_URL = "https://vetrix-catalog-studio.sinaizadmehrdv129898.chatgpt.site/studio";

const copy = {
  fa: {
    title: "کاتالوگ و فروش",
    subtitle: "ساخت کاتالوگ، انتشار آنلاین، سفارش‌گیری و اتصال به حسابداری Vetrix",
    open: "بازکردن در پنجره جدید",
    reload: "بارگذاری مجدد",
    fullscreen: "نمایش بزرگ",
    notice: "کالا، مشتری، موجودی و اسناد مالی از برنامه حسابداری مدیریت می‌شوند. کاتالوگ‌ساز فقط طراحی، انتشار و دریافت سفارش را انجام می‌دهد.",
    frameTitle: "کاتالوگ‌ساز Vetrix",
  },
  ar: {
    title: "الكتالوج والمبيعات",
    subtitle: "إنشاء الكتالوج والنشر عبر الإنترنت والطلبات والربط مع محاسبة Vetrix",
    open: "فتح في نافذة جديدة",
    reload: "إعادة التحميل",
    fullscreen: "عرض موسّع",
    notice: "تُدار المنتجات والعملاء والمخزون والقيود المالية من برنامج المحاسبة. يتولى منشئ الكتالوج التصميم والنشر واستقبال الطلبات.",
    frameTitle: "منشئ كتالوج Vetrix",
  },
  tr: {
    title: "Katalog ve satış",
    subtitle: "Katalog oluşturma, çevrimiçi yayınlama, sipariş alma ve Vetrix muhasebe bağlantısı",
    open: "Yeni pencerede aç",
    reload: "Yeniden yükle",
    fullscreen: "Geniş görünüm",
    notice: "Ürünler, müşteriler, stok ve mali kayıtlar muhasebe uygulamasından yönetilir. Katalog aracı tasarım, yayın ve sipariş toplama işlerini yürütür.",
    frameTitle: "Vetrix Katalog Stüdyosu",
  },
  en: {
    title: "Catalog & sales",
    subtitle: "Create catalogs, publish online, capture orders, and connect them to Vetrix Accounting",
    open: "Open in new window",
    reload: "Reload",
    fullscreen: "Expanded view",
    notice: "Products, customers, inventory, and financial records are managed by the accounting app. Catalog Studio handles design, publishing, and order capture.",
    frameTitle: "Vetrix Catalog Studio",
  },
};

export default function CatalogStudio() {
  const { language, dir } = useLanguage();
  const text = copy[language] || copy.en;
  const [frameKey, setFrameKey] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const src = useMemo(() => {
    const url = new URL(CATALOG_STUDIO_URL);
    url.searchParams.set("source", "vetrix-erp");
    url.searchParams.set("locale", language || "en");
    url.searchParams.set("embedded", "1");
    return url.toString();
  }, [language]);

  return (
    <section className={`min-h-full p-3 md:p-5 ${expanded ? "fixed inset-0 z-50 bg-[var(--erp-bg)]" : ""}`} dir={dir}>
      <header className="erp-surface mb-3 flex flex-col gap-3 rounded-2xl p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cyan-400/15 text-cyan-300"><PackageSearch size={24} /></span>
          <div className="min-w-0">
            <h1 className="text-xl font-black text-[var(--erp-text)]">{text.title}</h1>
            <p className="mt-1 text-sm text-[var(--erp-muted)]">{text.subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setFrameKey((value) => value + 1)} className="erp-surface flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-[var(--erp-text)]"><RefreshCw size={17} />{text.reload}</button>
          <button type="button" onClick={() => setExpanded((value) => !value)} className="erp-surface flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-[var(--erp-text)]"><Maximize2 size={17} />{text.fullscreen}</button>
          <a href={src} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-cyan-400 px-3 py-2 text-sm font-black text-slate-950"><ExternalLink size={17} />{text.open}</a>
        </div>
      </header>

      <div className="mb-3 flex items-start gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-100">
        <ShieldCheck className="mt-0.5 shrink-0" size={18} />
        <p>{text.notice}</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--erp-border)] bg-slate-950" style={{ height: expanded ? "calc(100vh - 150px)" : "calc(100vh - 230px)", minHeight: 560 }}>
        <iframe key={frameKey} src={src} title={text.frameTitle} className="h-full w-full border-0" allow="clipboard-read; clipboard-write; fullscreen" />
      </div>
    </section>
  );
}
