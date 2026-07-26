export const PAGE_SIZES = {
  A4: { w: 794, h: 1123, label: "A4" },
  A5: { w: 559, h: 794, label: "A5" },
  THERMAL80: { w: 302, h: 980, label: "Thermal 80" },
  THERMAL58: { w: 220, h: 980, label: "Thermal 58" },
};

// Stable ids for the default template's elements, used to look up a
// translated display label at render time (see elementLabelFor) instead
// of baking a fixed-language string into the element data itself - a
// duplicated/custom element keeps whatever label it was given when
// created, same as a user-typed template name.
const ELEMENT_LABELS = {
  title: { fa: "عنوان فاکتور", ar: "عنوان الفاتورة", tr: "Fatura Başlığı", en: "Invoice title" },
  logo: { fa: "لوگو", ar: "الشعار", tr: "Logo", en: "Logo" },
  company: { fa: "نام شرکت", ar: "اسم الشركة", tr: "Şirket Adı", en: "Company name" },
  invoiceInfo: { fa: "اطلاعات فاکتور", ar: "معلومات الفاتورة", tr: "Fatura Bilgileri", en: "Invoice info" },
  customer: { fa: "طرف حساب", ar: "العميل", tr: "Cari", en: "Customer" },
  table: { fa: "جدول اقلام", ar: "جدول البنود", tr: "Kalem Tablosu", en: "Items table" },
  totals: { fa: "جمع فاکتور", ar: "إجمالي الفاتورة", tr: "Fatura Toplamı", en: "Invoice totals" },
  qr: { fa: "کد QR", ar: "رمز QR", tr: "QR Kodu", en: "QR Code" },
  note: { fa: "توضیحات", ar: "ملاحظات", tr: "Notlar", en: "Notes" },
  signature: { fa: "امضا", ar: "التوقيع", tr: "İmza", en: "Signature" },
  stamp: { fa: "مهر", ar: "الختم", tr: "Kaşe", en: "Stamp" },
  footer: { fa: "متن پایین", ar: "نص أسفل الصفحة", tr: "Alt Metin", en: "Footer text" },
};

export function elementLabelFor(id, type, language) {
  const entry = ELEMENT_LABELS[id];
  if (entry) return entry[language] || entry.en;
  return type;
}

export function defaultTemplateName(language) {
  return language === "fa"
    ? "قالب چاپ فاکتور"
    : language === "ar"
    ? "قالب طباعة الفاتورة"
    : language === "tr"
    ? "Fatura Yazdırma Şablonu"
    : "Invoice print template";
}

// Every piece of text printed on the invoice itself (not just the
// editor's chrome) must follow the selected language - this used to be
// a single Persian-only constant, so an English- or Arabic-language
// company would still print a Persian company subtitle, field labels
// and footer regardless of their chosen UI language.
export function buildDefaultConfig(language) {
  const company = {
    fa: "سیستم حسابداری و مدیریت فروش",
    ar: "نظام محاسبي وإدارة مبيعات",
    tr: "Muhasebe ve Satış Yönetim Sistemi",
    en: "Accounting & Sales Management System",
  }[language] || "Accounting & Sales Management System";

  const invoiceInfoText = {
    fa: "شماره: {{invoice_id}}\nتاریخ: {{invoice_date}}\nوضعیت: {{payment_status}}",
    ar: "الرقم: {{invoice_id}}\nالتاريخ: {{invoice_date}}\nالحالة: {{payment_status}}",
    tr: "No: {{invoice_id}}\nTarih: {{invoice_date}}\nDurum: {{payment_status}}",
    en: "No: {{invoice_id}}\nDate: {{invoice_date}}\nStatus: {{payment_status}}",
  }[language] || "No: {{invoice_id}}\nDate: {{invoice_date}}\nStatus: {{payment_status}}";

  const customerText = {
    fa: "طرف حساب\n{{customer_name}}\n{{customer_phone}}\n{{customer_address}}",
    ar: "العميل\n{{customer_name}}\n{{customer_phone}}\n{{customer_address}}",
    tr: "Cari\n{{customer_name}}\n{{customer_phone}}\n{{customer_address}}",
    en: "Customer\n{{customer_name}}\n{{customer_phone}}\n{{customer_address}}",
  }[language] || "Customer\n{{customer_name}}\n{{customer_phone}}\n{{customer_address}}";

  const noteText = {
    fa: "توضیحات\n{{invoice_note}}",
    ar: "ملاحظات\n{{invoice_note}}",
    tr: "Notlar\n{{invoice_note}}",
    en: "Notes\n{{invoice_note}}",
  }[language] || "Notes\n{{invoice_note}}";

  const signatureText = {
    fa: "امضاء فروشنده / حسابدار",
    ar: "توقيع البائع / المحاسب",
    tr: "Satıcı / Muhasebeci İmzası",
    en: "Seller / Accountant signature",
  }[language] || "Seller / Accountant signature";

  const stampText = {
    fa: "مهر شرکت / امضاء طرف حساب",
    ar: "ختم الشركة / توقيع العميل",
    tr: "Şirket Kaşesi / Müşteri İmzası",
    en: "Company stamp / Customer signature",
  }[language] || "Company stamp / Customer signature";

  const footerText = {
    fa: "با تشکر از اعتماد شما",
    ar: "شكراً لثقتكم",
    tr: "Güveniniz için teşekkür ederiz",
    en: "Thank you for your trust",
  }[language] || "Thank you for your trust";

  return {
    page_size: "A4",
    theme: { primary: "#0f172a", accent: "#06b6d4" },
    elements: [
      { id: "title", type: "text", label: elementLabelFor("title", "text", language), text: "{{invoice_title}}", x: 540, y: 45, w: 190, h: 45, fontSize: 24, color: "#0f172a", bg: "#ffffff", border: "#ffffff", radius: 10, align: "center", bold: true },
      { id: "logo", type: "logo", label: elementLabelFor("logo", "logo", language), text: "LOGO", x: 55, y: 40, w: 120, h: 65, fontSize: 18, color: "#0891b2", bg: "#ecfeff", border: "#bae6fd", radius: 16, align: "center", bold: true },
      { id: "company", type: "text", label: elementLabelFor("company", "text", language), text: `Vetrix ERP\n${company}`, x: 190, y: 45, w: 300, h: 75, fontSize: 18, color: "#0891b2", bg: "#ffffff", border: "#ffffff", radius: 8, align: "center", bold: true },
      { id: "invoiceInfo", type: "box", label: elementLabelFor("invoiceInfo", "box", language), text: invoiceInfoText, x: 520, y: 120, w: 220, h: 90, fontSize: 13, color: "#0f172a", bg: "#f8fafc", border: "#cbd5e1", radius: 14, align: "right", bold: false },
      { id: "customer", type: "box", label: elementLabelFor("customer", "box", language), text: customerText, x: 55, y: 145, w: 400, h: 95, fontSize: 14, color: "#0f172a", bg: "#ffffff", border: "#cbd5e1", radius: 14, align: "right", bold: false },
      { id: "table", type: "table", label: elementLabelFor("table", "table", language), text: elementLabelFor("table", "table", language), x: 55, y: 275, w: 685, h: 265, fontSize: 13, color: "#0f172a", bg: "#ffffff", border: "#94a3b8", radius: 10, align: "center", bold: true },
      { id: "totals", type: "totals", label: elementLabelFor("totals", "totals", language), text: elementLabelFor("totals", "totals", language), x: 55, y: 570, w: 300, h: 160, fontSize: 14, color: "#0f172a", bg: "#f8fafc", border: "#cbd5e1", radius: 14, align: "right", bold: false },
      { id: "qr", type: "qr", label: elementLabelFor("qr", "qr", language), text: "QR", x: 590, y: 600, w: 105, h: 105, fontSize: 14, color: "#0f172a", bg: "#ffffff", border: "#cbd5e1", radius: 12, align: "center", bold: false },
      { id: "note", type: "box", label: elementLabelFor("note", "box", language), text: noteText, x: 55, y: 760, w: 685, h: 75, fontSize: 13, color: "#334155", bg: "#ffffff", border: "#e2e8f0", radius: 12, align: "right", bold: false },
      { id: "signature", type: "box", label: elementLabelFor("signature", "box", language), text: signatureText, x: 55, y: 900, w: 250, h: 85, fontSize: 13, color: "#64748b", bg: "#ffffff", border: "#cbd5e1", radius: 12, align: "center", bold: false },
      { id: "stamp", type: "box", label: elementLabelFor("stamp", "box", language), text: stampText, x: 490, y: 900, w: 250, h: 85, fontSize: 13, color: "#64748b", bg: "#ffffff", border: "#cbd5e1", radius: 12, align: "center", bold: false },
      { id: "footer", type: "text", label: elementLabelFor("footer", "text", language), text: footerText, x: 250, y: 1035, w: 300, h: 35, fontSize: 13, color: "#334155", bg: "transparent", border: "transparent", radius: 0, align: "center", bold: true },
    ],
  };
}

export function normalizeConfig(config, language) {
  const fallback = buildDefaultConfig(language);
  const source = config && typeof config === "object" ? config : fallback;
  return {
    ...fallback,
    ...source,
    theme: { ...fallback.theme, ...(source.theme || {}) },
    elements: Array.isArray(source.elements) && source.elements.length ? source.elements : fallback.elements,
  };
}

export function toNumber(value) {
  const cleaned = String(value ?? "0")
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/[,،]/g, "")
    .replace(/[^\d.-]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

export function getInvoiceItems(invoice) {
  if (Array.isArray(invoice?.items)) return invoice.items;
  if (Array.isArray(invoice?.invoice_items)) return invoice.invoice_items;
  if (Array.isArray(invoice?.details)) return invoice.details;
  return [];
}

export function getInvoiceTitle(invoice, language) {
  const type = invoice?.invoice_type || invoice?.type || "sale";
  const labels = {
    fa: {
      sale: "فاکتور فروش",
      buy: "فاکتور خرید",
      proforma: "پیش‌فاکتور",
      return_sale: "مرجوعی فروش",
      return_buy: "مرجوعی خرید",
    },
    ar: {
      sale: "فاتورة مبيعات",
      buy: "فاتورة مشتريات",
      proforma: "فاتورة أولية",
      return_sale: "مرتجع مبيعات",
      return_buy: "مرتجع مشتريات",
    },
    tr: {
      sale: "Satış Faturası",
      buy: "Alış Faturası",
      proforma: "Proforma Fatura",
      return_sale: "Satış İadesi",
      return_buy: "Alış İadesi",
    },
    en: {
      sale: "Sales Invoice",
      buy: "Purchase Invoice",
      proforma: "Proforma Invoice",
      return_sale: "Sales Return",
      return_buy: "Purchase Return",
    },
  };
  const map = labels[language] || labels.en;
  const fallback = { fa: "فاکتور", ar: "فاتورة", tr: "Fatura", en: "Invoice" }[language] || "Invoice";
  return invoice?.invoice_type_label || map[type] || fallback;
}

export function paymentLabel(status, language) {
  const key = String(status || "unpaid").toLowerCase();
  const labels = {
    fa: {
      paid: "تسویه شده",
      unpaid: "تسویه نشده",
      partial: "تسویه ناقص",
      draft: "پیش‌نویس",
      final: "نهایی",
    },
    ar: {
      paid: "مسدد",
      unpaid: "غير مسدد",
      partial: "مسدد جزئيًا",
      draft: "مسودة",
      final: "نهائي",
    },
    tr: {
      paid: "Ödendi",
      unpaid: "Ödenmedi",
      partial: "Kısmi Ödendi",
      draft: "Taslak",
      final: "Kesin",
    },
    en: {
      paid: "Paid",
      unpaid: "Unpaid",
      partial: "Partial",
      draft: "Draft",
      final: "Final",
    },
  };
  const map = labels[language] || labels.en;
  return map[key] || key || "-";
}

export function buildReplaceTokens({ invoice, totals, language, n, money, date }) {
  return function replaceTokens(text) {
    const notRegistered =
      language === "fa" ? "ثبت نشده" : language === "ar" ? "غير مسجل" : language === "tr" ? "Kayıtlı değil" : "Not registered";
    const customerName = invoice?.customerName || invoice?.customer_name || invoice?.customer?.name || "-";
    const customerPhone = invoice?.customer?.phone || invoice?.customer_phone || invoice?.phone || notRegistered;
    const customerAddress = invoice?.customer?.address || invoice?.customer_address || invoice?.address || notRegistered;
    const invoiceDate = date(invoice?.created_at || new Date(), { month: "long" });
    const invoiceTitle = getInvoiceTitle(invoice, language);
    const status = paymentLabel(invoice?.payment_status || invoice?.status, language);

    const tokens = {
      "{{invoice_title}}": invoiceTitle,
      "{{invoice_id}}": `#${n(invoice?.id || "")}`,
      "{{invoice_date}}": invoiceDate,
      "{{payment_status}}": status,
      "{{customer_name}}": customerName,
      "{{customer_phone}}": customerPhone,
      "{{customer_address}}": customerAddress,
      "{{subtotal}}": money(totals.subtotal),
      "{{discount}}": money(totals.discount),
      "{{tax}}": money(totals.tax),
      "{{shipping}}": money(totals.shipping),
      "{{total}}": money(totals.total),
      "{{settled}}": money(totals.settled),
      "{{remaining}}": money(totals.remaining),
      "{{invoice_note}}": invoice?.invoice_note || invoice?.note || "-",
    };

    return String(text || "").replace(/\{\{[^}]+\}\}/g, (match) => tokens[match] ?? match);
  };
}

export function computeInvoiceTotals(invoice, items) {
  const subtotal =
    invoice?.subtotal ??
    items.reduce((sum, item) => sum + toNumber(item.quantity) * toNumber(item.unit_price ?? item.price), 0);

  const discount = toNumber(invoice?.discount ?? invoice?.discount_amount);
  const tax = toNumber(invoice?.tax ?? invoice?.tax_amount);
  const shipping = toNumber(invoice?.shipping_cost);
  const total = invoice?.total_amount ?? invoice?.total ?? subtotal - discount + tax + shipping;
  const settled = toNumber(invoice?.settled_amount ?? invoice?.paid_amount ?? invoice?.received_amount);
  const remaining = Math.max(toNumber(invoice?.remaining_amount ?? total - settled), 0);

  return { subtotal, discount, tax, shipping, total, settled, remaining };
}
