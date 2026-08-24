// The backend mostly raises plain English error strings (a long-standing,
// broad characteristic of this codebase, not something introduced here).
// Translating every possible message is out of scope, but the ones that can
// actually surface through the create/update/delete flows now shown
// directly to the user (see services/api.js's isNetworkError) must not leak
// raw English into an otherwise fully localized UI. Unmapped messages still
// fall back to the raw string rather than disappearing.
const EXACT_MESSAGES = {
  "Your role does not permit this operation": {
    fa: "نقش شما اجازه‌ی انجام این عملیات را ندارد.",
    ar: "دورك لا يسمح بتنفيذ هذه العملية.",
    tr: "Rolünüz bu işlemi gerçekleştirmenize izin vermiyor.",
    en: "Your role does not permit this operation.",
  },
  "Password change required before continuing": {
    fa: "پیش از ادامه باید رمز عبور را تغییر دهید.",
    ar: "يجب تغيير كلمة المرور قبل المتابعة.",
    tr: "Devam etmeden önce şifrenizi değiştirmeniz gerekir.",
    en: "You must change your password before continuing.",
  },
  "Customer not found": {
    fa: "طرف‌حساب پیدا نشد.",
    ar: "لم يتم العثور على الطرف.",
    tr: "Cari bulunamadı.",
    en: "Customer not found.",
  },
  "Product not found": {
    fa: "کالا پیدا نشد.",
    ar: "لم يتم العثور على المنتج.",
    tr: "Ürün bulunamadı.",
    en: "Product not found.",
  },
  "Product no longer exists": {
    fa: "این کالا دیگر وجود ندارد.",
    ar: "لم يعد هذا المنتج موجودًا.",
    tr: "Bu ürün artık mevcut değil.",
    en: "This product no longer exists.",
  },
  "Invoice not found": {
    fa: "فاکتور پیدا نشد.",
    ar: "لم يتم العثور على الفاتورة.",
    tr: "Fatura bulunamadı.",
    en: "Invoice not found.",
  },
  "This customer has accounting history and cannot be deleted.": {
    fa: "این طرف‌حساب دارای سابقه حسابداری است و قابل حذف نیست.",
    ar: "لهذا الطرف سجل محاسبي ولا يمكن حذفه.",
    tr: "Bu carinin muhasebe geçmişi var ve silinemez.",
    en: "This customer has accounting history and cannot be deleted.",
  },
  "Company name is required": {
    fa: "نام شرکت الزامی است.",
    ar: "اسم الشركة مطلوب.",
    tr: "Şirket adı gereklidir.",
    en: "Company name is required.",
  },
  "A company with this name already exists": {
    fa: "شرکتی با این نام از قبل وجود دارد.",
    ar: "توجد شركة بهذا الاسم بالفعل.",
    tr: "Bu ada sahip bir şirket zaten var.",
    en: "A company with this name already exists.",
  },
  "Company not found": {
    fa: "شرکت پیدا نشد.",
    ar: "لم يتم العثور على الشركة.",
    tr: "Şirket bulunamadı.",
    en: "Company not found.",
  },
  "Company is inactive": {
    fa: "این شرکت غیرفعال است.",
    ar: "هذه الشركة غير نشطة.",
    tr: "Bu şirket devre dışı.",
    en: "This company is inactive.",
  },
  "Invalid invoice_type": {
    fa: "نوع فاکتور نامعتبر است.",
    ar: "نوع الفاتورة غير صالح.",
    tr: "Geçersiz fatura türü.",
    en: "Invalid invoice type.",
  },
  "Invalid payment_status": {
    fa: "وضعیت پرداخت نامعتبر است.",
    ar: "حالة السداد غير صالحة.",
    tr: "Geçersiz ödeme durumu.",
    en: "Invalid payment status.",
  },
  "New invoices must start with unpaid payment_status": {
    fa: "فاکتور جدید باید با وضعیت «پرداخت‌نشده» ثبت شود.",
    ar: "يجب أن تبدأ الفاتورة الجديدة بحالة «غير مسدد».",
    tr: "Yeni fatura «ödenmedi» durumuyla başlamalıdır.",
    en: "New invoices must start as unpaid.",
  },
  "Cannot edit an invoice with linked payment or receipt transactions": {
    fa: "فاکتوری که دریافت یا پرداخت به آن متصل است قابل ویرایش نیست.",
    ar: "لا يمكن تعديل فاتورة مرتبطة بمعاملات دفع أو استلام.",
    tr: "Bağlı ödeme veya tahsilat işlemi olan bir fatura düzenlenemez.",
    en: "An invoice with linked payment or receipt transactions cannot be edited.",
  },
  "Opening stock cannot be negative": {
    fa: "موجودی اولیه نمی‌تواند منفی باشد.",
    ar: "لا يمكن أن يكون المخزون الافتتاحي سالبًا.",
    tr: "Açılış stoğu negatif olamaz.",
    en: "Opening stock cannot be negative.",
  },
  "Amount must be greater than zero": {
    fa: "مبلغ باید بیشتر از صفر باشد.",
    ar: "يجب أن يكون المبلغ أكبر من صفر.",
    tr: "Tutar sıfırdan büyük olmalıdır.",
    en: "Amount must be greater than zero.",
  },
  "این فاکتور متعلق به این طرف‌حساب نیست": {
    fa: "این فاکتور متعلق به این طرف‌حساب نیست.",
    ar: "هذه الفاتورة لا تخص هذا الطرف.",
    tr: "Bu fatura bu cariye ait değil.",
    en: "This invoice does not belong to this customer.",
  },
  "Proforma invoices cannot receive settlement transactions": {
    fa: "پیش‌فاکتور نمی‌تواند دریافت یا پرداخت داشته باشد.",
    ar: "لا يمكن للفاتورة الأولية استلام معاملات تسوية.",
    tr: "Proforma fatura tahsilat/ödeme alamaz.",
    en: "A proforma invoice cannot receive settlement transactions.",
  },
  // Idempotency-key protection (app/idempotency.py) - surfaces only on a
  // genuine double-submit race, not normal usage.
  "Idempotency key reused with a different request payload": {
    fa: "این درخواست قبلاً با محتوای متفاوتی ارسال شده است.",
    ar: "تم إرسال هذا الطلب مسبقًا بمحتوى مختلف.",
    tr: "Bu istek daha önce farklı bir içerikle gönderildi.",
    en: "This request was already sent earlier with different content.",
  },
  "A request with this idempotency key is already in progress": {
    fa: "این درخواست هم‌اکنون در حال پردازش است؛ لطفاً صبر کنید.",
    ar: "هذا الطلب قيد المعالجة حاليًا؛ يرجى الانتظار.",
    tr: "Bu istek şu anda işleniyor; lütfen bekleyin.",
    en: "This request is already being processed; please wait.",
  },
  // Invoice payment allocations (app/invoice_payments.py)
  "This payment allocation is not active": {
    fa: "این ردیف پرداخت فعال نیست.",
    ar: "بند الدفع هذا غير نشط.",
    tr: "Bu ödeme satırı aktif değil.",
    en: "This payment line is not active.",
  },
  "Payment allocation is not active": {
    fa: "این ردیف پرداخت فعال نیست.",
    ar: "بند الدفع هذا غير نشط.",
    tr: "Bu ödeme satırı aktif değil.",
    en: "This payment line is not active.",
  },
  "Cannot void a leg backed by a cleared cheque - issue a refund instead": {
    fa: "ردیفی که با چک وصول‌شده پشتیبانی می‌شود قابل ابطال نیست؛ به‌جای آن استرداد ثبت کنید.",
    ar: "لا يمكن إبطال بند مدعوم بشيك محصّل؛ سجّل استردادًا بدلاً من ذلك.",
    tr: "Tahsil edilmiş çekle desteklenen bir satır iptal edilemez; bunun yerine iade kaydedin.",
    en: "A line backed by a cleared cheque cannot be voided - record a refund instead.",
  },
  "Refund amount must be positive and not exceed the allocation amount": {
    fa: "مبلغ استرداد باید مثبت باشد و از مبلغ ردیف پرداخت بیشتر نشود.",
    ar: "يجب أن يكون مبلغ الاسترداد موجبًا ولا يتجاوز مبلغ بند الدفع.",
    tr: "İade tutarı pozitif olmalı ve ödeme satırı tutarını aşmamalıdır.",
    en: "The refund amount must be positive and cannot exceed the payment line's amount.",
  },
  "Original ledger entry not found": {
    fa: "سند حسابداری اصلی پیدا نشد.",
    ar: "لم يتم العثور على القيد المحاسبي الأصلي.",
    tr: "Orijinal muhasebe kaydı bulunamadı.",
    en: "The original accounting entry was not found.",
  },
  "A positive amount and cheque number are required for a cheque payment": {
    fa: "برای پرداخت با چک، مبلغ مثبت و شماره چک الزامی است.",
    ar: "الدفع بشيك يتطلب مبلغًا موجبًا ورقم شيك.",
    tr: "Çekle ödeme için pozitif bir tutar ve çek numarası gereklidir.",
    en: "A positive amount and cheque number are required for a cheque payment.",
  },
  // Generic approval engine (app/approvals/engine.py)
  "A reason is required to request approval": {
    fa: "برای درخواست تایید، ذکر دلیل الزامی است.",
    ar: "يلزم ذكر السبب لطلب الموافقة.",
    tr: "Onay talep etmek için bir neden gereklidir.",
    en: "A reason is required to request approval.",
  },
  "Approval request not found": {
    fa: "درخواست تایید پیدا نشد.",
    ar: "لم يتم العثور على طلب الموافقة.",
    tr: "Onay talebi bulunamadı.",
    en: "Approval request not found.",
  },
  "Approval request is not pending": {
    fa: "این درخواست دیگر در وضعیت «در انتظار تایید» نیست.",
    ar: "هذا الطلب لم يعد في حالة «قيد الموافقة».",
    tr: "Bu talep artık «onay bekliyor» durumunda değil.",
    en: "This request is no longer pending.",
  },
  "Maker-checker violation: requester cannot approve their own request": {
    fa: "ثبت‌کننده‌ی درخواست نمی‌تواند درخواست خودش را تایید کند.",
    ar: "لا يمكن لمقدم الطلب الموافقة على طلبه الخاص.",
    tr: "Talebi oluşturan kişi kendi talebini onaylayamaz.",
    en: "The person who requested this cannot also approve it.",
  },
  "Maker-checker violation: requester cannot decide their own request": {
    fa: "ثبت‌کننده‌ی درخواست نمی‌تواند درباره‌ی درخواست خودش تصمیم بگیرد.",
    ar: "لا يمكن لمقدم الطلب اتخاذ قرار بشأن طلبه الخاص.",
    tr: "Talebi oluşturan kişi kendi talebi hakkında karar veremez.",
    en: "The person who requested this cannot decide on it.",
  },
  "A rejection note is required": {
    fa: "برای رد درخواست، ذکر توضیح الزامی است.",
    ar: "يلزم إدخال ملاحظة لرفض الطلب.",
    tr: "Talebi reddetmek için bir not gereklidir.",
    en: "A note is required to reject this request.",
  },
  "Only pending requests can be withdrawn": {
    fa: "فقط درخواست‌های در انتظار تایید قابل انصراف هستند.",
    ar: "يمكن سحب الطلبات قيد الموافقة فقط.",
    tr: "Yalnızca onay bekleyen talepler geri çekilebilir.",
    en: "Only pending requests can be withdrawn.",
  },
  "Only the requester can withdraw this request": {
    fa: "فقط ثبت‌کننده‌ی درخواست می‌تواند آن را پس بگیرد.",
    ar: "يمكن لمقدم الطلب فقط سحب هذا الطلب.",
    tr: "Bu talebi yalnızca talebi oluşturan kişi geri çekebilir.",
    en: "Only the person who made this request can withdraw it.",
  },
  "Emergency override requires admin role": {
    fa: "تایید اضطراری فقط برای نقش مدیر امکان‌پذیر است.",
    ar: "التجاوز الطارئ متاح فقط لدور المدير.",
    tr: "Acil durum onayı yalnızca yönetici rolü için mümkündür.",
    en: "Emergency override is only available to the admin role.",
  },
  "A reason is required for an emergency override": {
    fa: "برای تایید اضطراری، ذکر دلیل الزامی است.",
    ar: "يلزم ذكر السبب للتجاوز الطارئ.",
    tr: "Acil durum onayı için bir neden gereklidir.",
    en: "A reason is required for an emergency override.",
  },
};

const DYNAMIC_PATTERNS = [
  {
    pattern: /^Product with id (\S+) not found$/,
    build: ([, id]) => ({
      fa: `کالا با شناسه ${id} پیدا نشد.`,
      ar: `لم يتم العثور على منتج بالمعرف ${id}.`,
      tr: `${id} kimlikli ürün bulunamadı.`,
      en: `Product with id ${id} not found.`,
    }),
  },
  {
    pattern: /^pricing_group must be one of: (.+)$/,
    build: ([, list]) => ({
      fa: `گروه قیمت‌گذاری باید یکی از این‌ها باشد: ${list}`,
      ar: `يجب أن تكون فئة التسعير واحدة من: ${list}`,
      tr: `Fiyatlandırma grubu şunlardan biri olmalı: ${list}`,
      en: `pricing_group must be one of: ${list}`,
    }),
  },
  {
    pattern: /^outcome must be one of: (.+)$/,
    build: ([, list]) => ({
      fa: `نتیجه ویزیت باید یکی از این‌ها باشد: ${list}`,
      ar: `يجب أن تكون نتيجة الزيارة واحدة من: ${list}`,
      tr: `Ziyaret sonucu şunlardan biri olmalı: ${list}`,
      en: `outcome must be one of: ${list}`,
    }),
  },
  {
    pattern: /^Invalid payment method: (.+)$/,
    build: ([, method]) => ({
      fa: `روش پرداخت «${method}» نامعتبر است.`,
      ar: `طريقة الدفع «${method}» غير صالحة.`,
      tr: `«${method}» geçersiz bir ödeme yöntemi.`,
      en: `"${method}" is not a valid payment method.`,
    }),
  },
  {
    pattern: /^Transaction exceeds invoice remaining amount: (.+)$/,
    build: ([, remaining]) => ({
      fa: `مبلغ تراکنش از باقی‌مانده‌ی فاکتور (${remaining}) بیشتر است.`,
      ar: `يتجاوز مبلغ المعاملة المتبقي من الفاتورة (${remaining}).`,
      tr: `İşlem tutarı faturanın kalan bakiyesini (${remaining}) aşıyor.`,
      en: `The transaction amount exceeds the invoice's remaining balance (${remaining}).`,
    }),
  },
  {
    pattern: /^(\S+) invoices require a (\S+) transaction$/,
    build: ([, invoiceType, transactionType]) => ({
      fa: `فاکتور نوع «${invoiceType}» فقط تراکنش «${transactionType}» می‌پذیرد.`,
      ar: `فواتير «${invoiceType}» تتطلب معاملة «${transactionType}».`,
      tr: `«${invoiceType}» türündeki faturalar «${transactionType}» işlemi gerektirir.`,
      en: `"${invoiceType}" invoices require a "${transactionType}" transaction.`,
    }),
  },
  {
    pattern: /^Cannot transition a (\S+) cheque from '(\S+)' to '(\S+)'$/,
    build: ([, direction, from_, to]) => ({
      fa: `چک «${direction}» را نمی‌توان از وضعیت «${from_}» به «${to}» تغییر داد.`,
      ar: `لا يمكن تحويل شيك «${direction}» من الحالة «${from_}» إلى «${to}».`,
      tr: `«${direction}» çeki «${from_}» durumundan «${to}» durumuna geçirilemez.`,
      en: `Cannot move a "${direction}" cheque from "${from_}" to "${to}".`,
    }),
  },
  {
    pattern: /^This level requires role: (.+)$/,
    build: ([, role]) => ({
      fa: `این مرحله از تایید نیازمند نقش «${role}» است.`,
      ar: `هذا المستوى يتطلب دور «${role}».`,
      tr: `Bu onay seviyesi «${role}» rolünü gerektirir.`,
      en: `This approval level requires the "${role}" role.`,
    }),
  },
];

export function translateApiError(message, language) {
  if (!message) return message;
  const exact = EXACT_MESSAGES[message];
  if (exact) return exact[language] || exact.en || message;

  for (const { pattern, build } of DYNAMIC_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      const dict = build(match);
      return dict[language] || dict.en || message;
    }
  }

  return message;
}
