import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  Loader2,
  Lock,
  MailQuestion,
  ShieldCheck,
  Sparkles,
  User,
  UserPlus,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../localization/useLanguage";
import { API_URL } from "../services/api";
import Badge from "../components/ui/Badge";
import Notice from "../components/ui/Notice";
import BrandLogo from "../components/brand/BrandLogo";
import heroArtwork from "../assets/hero.png";

const APP_VERSION_FALLBACK = "1.4.1";
const EASE = [0.16, 1, 0.3, 1];

const LANGUAGE_OPTIONS = [
  { value: "fa", label: "فارسی" },
  { value: "tr", label: "Türkçe" },
  { value: "en", label: "English" },
  { value: "ar", label: "العربية" },
];

const AUTH_TEXT = {
  en: {
    productSubtitle: "Professional Accounting System",
    versionLabel: "Version",
    language: "Language",
    authNavigation: "Authentication",
    signIn: "Sign in",
    createAccount: "Create account",
    forgotPassword: "Forgot password",
    welcomeTitle: "Welcome back",
    welcomeSubtitle: "Sign in to your protected VITALIX workspace.",
    setupTitle: "Create first administrator",
    setupSubtitle: "Secure first-run setup for this installation.",
    registerTitle: "Create account",
    registerSubtitle: "Account creation follows the active security policy.",
    forgotTitle: "Password recovery",
    forgotSubtitle: "Use the established local recovery path.",
    checkingTitle: "Checking installation",
    checkingBody: "Verifying the local VITALIX service...",
    firstRunNotice: "No users exist yet. Create the first system administrator; this bootstrap path closes automatically afterwards.",
    registrationClosedTitle: "Account creation is administrator-controlled",
    registrationClosedBody: "This installation is already initialized. Ask a system administrator to create or approve your user account.",
    recoveryNotice: "There is no email or SMS reset in this local install. Ask a system administrator to open User Management, reset your password, and keep \"change password on next login\" enabled. The same response is shown for every username.",
    firstAdminCreated: "Administrator created. Sign in with the username and password you just set.",
    recoveryAccepted: "Recovery request recorded. If this account can be reset here, a system administrator must reset it in User Management; then return to sign in.",
    serviceUnavailable: "VITALIX service is not reachable. Retry in a few seconds.",
    username: "Username",
    usernamePlaceholder: "Enter username",
    password: "Password",
    passwordPlaceholder: "Enter password",
    fullName: "Full name",
    fullNamePlaceholder: "Administrator full name",
    confirmPassword: "Confirm password",
    confirmPasswordPlaceholder: "Repeat password",
    verificationCode: "Verification code",
    verificationPlaceholder: "6-digit code or recovery code",
    newPassword: "New password",
    newPasswordPlaceholder: "At least 12 characters",
    confirmNewPassword: "Confirm new password",
    submitLogin: "Sign in",
    submitSetup: "Create administrator",
    submitForgot: "Request recovery",
    submitTotp: "Verify and sign in",
    submitPasswordChange: "Change password and continue",
    signingIn: "Signing in...",
    creatingAdmin: "Creating administrator...",
    requestingRecovery: "Requesting recovery...",
    verifying: "Verifying...",
    changingPassword: "Changing password...",
    showPassword: "Show password",
    hidePassword: "Hide password",
    backToLogin: "Back to sign in",
    loginInvalid: "Username or password is not correct.",
    totpInvalid: "The verification code is not valid.",
    passwordChangeFailed: "Password change failed.",
    weakPassword: "Password must contain at least 12 characters.",
    passwordMismatch: "Password confirmation does not match.",
    requiredFields: "Complete all required fields.",
    duplicateUsername: "That username is already in use.",
    setupFailed: "Administrator creation failed.",
    recoveryFailed: "Recovery request could not be completed.",
    tooManyAttempts: "Too many failed attempts. Try again later.",
    passwordChangeRequired: "To continue, your administrator requires you to change your password.",
    mfaPrompt: "Enter the code from your authenticator app, or a recovery code.",
    createPrompt: "New to this installation?",
    forgotPrompt: "Need help signing in?",
    featureTitle: "Everything to run your business intelligently, in one place.",
    tagline: "Smarter numbers, stronger decisions",
    features: ["Role-aware access", "Encrypted sessions", "Audit-ready controls", "Country-aware finance"],
  },
  tr: {
    productSubtitle: "Profesyonel Muhasebe Sistemi",
    versionLabel: "Sürüm",
    language: "Dil",
    authNavigation: "Kimlik doğrulama",
    signIn: "Giriş yap",
    createAccount: "Hesap oluştur",
    forgotPassword: "Parolamı unuttum",
    welcomeTitle: "Tekrar hoş geldiniz",
    welcomeSubtitle: "Korumalı VITALIX çalışma alanınıza giriş yapın.",
    setupTitle: "İlk yöneticiyi oluştur",
    setupSubtitle: "Bu kurulum için güvenli ilk başlatma.",
    registerTitle: "Hesap oluştur",
    registerSubtitle: "Hesap oluşturma etkin güvenlik ilkesini izler.",
    forgotTitle: "Parola kurtarma",
    forgotSubtitle: "Yerel kurtarma yolunu kullanın.",
    checkingTitle: "Kurulum kontrol ediliyor",
    checkingBody: "Yerel VITALIX hizmeti doğrulanıyor...",
    firstRunNotice: "Henüz kullanıcı yok. İlk sistem yöneticisini oluşturun; bu başlangıç yolu sonrasında otomatik kapanır.",
    registrationClosedTitle: "Hesap oluşturma yönetici denetimindedir",
    registrationClosedBody: "Bu kurulum zaten başlatılmış. Kullanıcı hesabınızı oluşturması veya onaylaması için sistem yöneticisine başvurun.",
    recoveryNotice: "Bu yerel kurulumda e-posta veya SMS ile sıfırlama yok. Sistem yöneticisinden Kullanıcı Yönetimi'nde parolanızı sıfırlamasını ve \"sonraki girişte parola değiştir\" seçeneğini açık bırakmasını isteyin. Her kullanıcı adı için aynı yanıt gösterilir.",
    firstAdminCreated: "Yönetici oluşturuldu. Az önce belirlediğiniz kullanıcı adı ve parola ile giriş yapın.",
    recoveryAccepted: "Kurtarma isteği alındı. Bu hesap burada sıfırlanabiliyorsa sistem yöneticisi Kullanıcı Yönetimi'nde sıfırlar; ardından girişe dönün.",
    serviceUnavailable: "VITALIX hizmetine ulaşılamıyor. Birkaç saniye sonra tekrar deneyin.",
    username: "Kullanıcı adı",
    usernamePlaceholder: "Kullanıcı adını girin",
    password: "Parola",
    passwordPlaceholder: "Parolayı girin",
    fullName: "Ad soyad",
    fullNamePlaceholder: "Yönetici adı soyadı",
    confirmPassword: "Parolayı onayla",
    confirmPasswordPlaceholder: "Parolayı tekrar girin",
    verificationCode: "Doğrulama kodu",
    verificationPlaceholder: "6 haneli kod veya kurtarma kodu",
    newPassword: "Yeni parola",
    newPasswordPlaceholder: "En az 12 karakter",
    confirmNewPassword: "Yeni parolayı onayla",
    submitLogin: "Giriş yap",
    submitSetup: "Yönetici oluştur",
    submitForgot: "Kurtarma iste",
    submitTotp: "Doğrula ve giriş yap",
    submitPasswordChange: "Parolayı değiştir ve devam et",
    signingIn: "Giriş yapılıyor...",
    creatingAdmin: "Yönetici oluşturuluyor...",
    requestingRecovery: "Kurtarma isteniyor...",
    verifying: "Doğrulanıyor...",
    changingPassword: "Parola değiştiriliyor...",
    showPassword: "Parolayı göster",
    hidePassword: "Parolayı gizle",
    backToLogin: "Girişe dön",
    loginInvalid: "Kullanıcı adı veya parola doğru değil.",
    totpInvalid: "Doğrulama kodu geçerli değil.",
    passwordChangeFailed: "Parola değiştirilemedi.",
    weakPassword: "Parola en az 12 karakter içermelidir.",
    passwordMismatch: "Parola onayı eşleşmiyor.",
    requiredFields: "Tüm zorunlu alanları doldurun.",
    duplicateUsername: "Bu kullanıcı adı zaten kullanılıyor.",
    setupFailed: "Yönetici oluşturulamadı.",
    recoveryFailed: "Kurtarma isteği tamamlanamadı.",
    tooManyAttempts: "Çok fazla başarısız deneme. Daha sonra tekrar deneyin.",
    passwordChangeRequired: "Devam etmek için yöneticiniz parolanızı değiştirmenizi istiyor.",
    mfaPrompt: "Kimlik doğrulama uygulamasındaki kodu veya kurtarma kodunu girin.",
    createPrompt: "Bu kurulumda yeni misiniz?",
    forgotPrompt: "Giriş için yardıma mı ihtiyacınız var?",
    featureTitle: "İşletmenizi akıllıca yönetmek için gereken her şey tek yerde.",
    tagline: "Daha akıllı sayılar, daha güçlü kararlar",
    features: ["Rol tabanlı erişim", "Şifreli oturumlar", "Denetime hazır kontroller", "Ülkeye uyumlu finans"],
  },
  fa: {
    productSubtitle: "سیستم حرفه‌ای حسابداری",
    versionLabel: "نسخه",
    language: "زبان",
    authNavigation: "احراز هویت",
    signIn: "ورود",
    createAccount: "ثبت‌نام",
    forgotPassword: "فراموشی رمز",
    welcomeTitle: "خوش آمدید",
    welcomeSubtitle: "به فضای کاری امن VITALIX وارد شوید.",
    setupTitle: "ساخت مدیر اولیه",
    setupSubtitle: "راه‌اندازی امن اولین اجرای این نصب.",
    registerTitle: "ایجاد حساب",
    registerSubtitle: "ایجاد حساب طبق سیاست امنیتی فعال انجام می‌شود.",
    forgotTitle: "بازیابی رمز عبور",
    forgotSubtitle: "از مسیر بازیابی محلی تأییدشده استفاده کنید.",
    checkingTitle: "بررسی نصب",
    checkingBody: "در حال بررسی سرویس محلی VITALIX...",
    firstRunNotice: "هنوز هیچ کاربری وجود ندارد. مدیر اصلی سیستم را بسازید؛ این مسیر فقط برای اولین اجرا باز است.",
    registrationClosedTitle: "ایجاد حساب تحت کنترل مدیر سیستم است",
    registrationClosedBody: "این نصب قبلاً راه‌اندازی شده است. برای ایجاد یا تأیید حساب کاربری با مدیر سیستم تماس بگیرید.",
    recoveryNotice: "در این نصب محلی بازنشانی با ایمیل یا پیامک وجود ندارد. از مدیر سیستم بخواهید در بخش مدیریت کاربران رمز عبور شما را بازنشانی کند و گزینه «تغییر رمز در ورود بعدی» را فعال بگذارد. پاسخ برای همه نام‌های کاربری یکسان است.",
    firstAdminCreated: "مدیر ساخته شد. با همان نام کاربری و رمز عبور وارد شوید.",
    recoveryAccepted: "درخواست بازیابی ثبت شد. اگر این حساب در این نصب قابل بازنشانی باشد، مدیر سیستم آن را در مدیریت کاربران بازنشانی می‌کند؛ سپس به صفحه ورود برگردید.",
    serviceUnavailable: "ارتباط با سرویس VITALIX برقرار نشد. چند ثانیه بعد دوباره تلاش کنید.",
    username: "نام کاربری",
    usernamePlaceholder: "نام کاربری را وارد کنید",
    password: "رمز عبور",
    passwordPlaceholder: "رمز عبور را وارد کنید",
    fullName: "نام کامل",
    fullNamePlaceholder: "نام کامل مدیر",
    confirmPassword: "تکرار رمز عبور",
    confirmPasswordPlaceholder: "رمز عبور را تکرار کنید",
    verificationCode: "کد تأیید",
    verificationPlaceholder: "کد ۶ رقمی یا کد بازیابی",
    newPassword: "رمز عبور جدید",
    newPasswordPlaceholder: "حداقل ۱۲ نویسه",
    confirmNewPassword: "تکرار رمز جدید",
    submitLogin: "ورود",
    submitSetup: "ساخت مدیر",
    submitForgot: "درخواست بازیابی",
    submitTotp: "تأیید و ورود",
    submitPasswordChange: "تغییر رمز و ادامه",
    signingIn: "در حال ورود...",
    creatingAdmin: "در حال ساخت مدیر...",
    requestingRecovery: "در حال ثبت درخواست...",
    verifying: "در حال بررسی...",
    changingPassword: "در حال تغییر رمز...",
    showPassword: "نمایش رمز",
    hidePassword: "پنهان کردن رمز",
    backToLogin: "بازگشت به ورود",
    loginInvalid: "نام کاربری یا رمز عبور درست نیست.",
    totpInvalid: "کد تأیید معتبر نیست.",
    passwordChangeFailed: "تغییر رمز عبور انجام نشد.",
    weakPassword: "رمز عبور باید حداقل ۱۲ نویسه باشد.",
    passwordMismatch: "تکرار رمز عبور مطابقت ندارد.",
    requiredFields: "همه فیلدهای ضروری را کامل کنید.",
    duplicateUsername: "این نام کاربری قبلاً استفاده شده است.",
    setupFailed: "ساخت مدیر انجام نشد.",
    recoveryFailed: "درخواست بازیابی کامل نشد.",
    tooManyAttempts: "تعداد تلاش‌های ناموفق زیاد است. بعداً دوباره تلاش کنید.",
    passwordChangeRequired: "برای ادامه، مدیر سیستم تغییر رمز عبور را الزامی کرده است.",
    mfaPrompt: "کد برنامه احراز هویت یا یکی از کدهای بازیابی را وارد کنید.",
    createPrompt: "در این نصب حساب ندارید؟",
    forgotPrompt: "برای ورود کمک لازم دارید؟",
    featureTitle: "همه‌چیز برای اداره هوشمند کسب‌وکار شما، در یک‌جا.",
    tagline: "اعداد هوشمندتر، تصمیم‌های قوی‌تر",
    features: ["دسترسی نقش‌محور", "نشست‌های رمزنگاری‌شده", "کنترل‌های آماده حسابرسی", "مالی متناسب با کشور"],
  },
  ar: {
    productSubtitle: "نظام محاسبي احترافي",
    versionLabel: "الإصدار",
    language: "اللغة",
    authNavigation: "المصادقة",
    signIn: "تسجيل الدخول",
    createAccount: "إنشاء حساب",
    forgotPassword: "نسيت كلمة المرور",
    welcomeTitle: "مرحبًا بعودتك",
    welcomeSubtitle: "ادخل إلى مساحة عمل VITALIX المحمية.",
    setupTitle: "إنشاء المسؤول الأول",
    setupSubtitle: "إعداد آمن للتشغيل الأول لهذا التثبيت.",
    registerTitle: "إنشاء حساب",
    registerSubtitle: "إنشاء الحساب يتبع سياسة الأمان النشطة.",
    forgotTitle: "استرداد كلمة المرور",
    forgotSubtitle: "استخدم مسار الاسترداد المحلي المعتمد.",
    checkingTitle: "جارٍ فحص التثبيت",
    checkingBody: "جارٍ التحقق من خدمة VITALIX المحلية...",
    firstRunNotice: "لا يوجد مستخدمون بعد. أنشئ مسؤول النظام الأول؛ يغلق مسار التمهيد هذا تلقائيًا بعد ذلك.",
    registrationClosedTitle: "إنشاء الحسابات تحت تحكم المسؤول",
    registrationClosedBody: "تمت تهيئة هذا التثبيت مسبقًا. اطلب من مسؤول النظام إنشاء حسابك أو اعتماده.",
    recoveryNotice: "لا توجد إعادة تعيين عبر البريد الإلكتروني أو الرسائل القصيرة في هذا التثبيت المحلي. اطلب من مسؤول النظام فتح إدارة المستخدمين وإعادة تعيين كلمة مرورك مع إبقاء خيار «تغيير كلمة المرور عند تسجيل الدخول التالي» مفعّلًا. تظهر الاستجابة نفسها لكل اسم مستخدم.",
    firstAdminCreated: "تم إنشاء المسؤول. سجّل الدخول باسم المستخدم وكلمة المرور اللذين حددتهما.",
    recoveryAccepted: "تم تسجيل طلب الاسترداد. إذا كان هذا الحساب قابلًا لإعادة التعيين هنا، فسيعيد مسؤول النظام تعيينه من إدارة المستخدمين؛ ثم عُد إلى تسجيل الدخول.",
    serviceUnavailable: "تعذر الوصول إلى خدمة VITALIX. أعد المحاولة بعد ثوانٍ قليلة.",
    username: "اسم المستخدم",
    usernamePlaceholder: "أدخل اسم المستخدم",
    password: "كلمة المرور",
    passwordPlaceholder: "أدخل كلمة المرور",
    fullName: "الاسم الكامل",
    fullNamePlaceholder: "الاسم الكامل للمسؤول",
    confirmPassword: "تأكيد كلمة المرور",
    confirmPasswordPlaceholder: "أعد إدخال كلمة المرور",
    verificationCode: "رمز التحقق",
    verificationPlaceholder: "رمز من 6 أرقام أو رمز استرداد",
    newPassword: "كلمة مرور جديدة",
    newPasswordPlaceholder: "12 حرفًا على الأقل",
    confirmNewPassword: "تأكيد كلمة المرور الجديدة",
    submitLogin: "تسجيل الدخول",
    submitSetup: "إنشاء المسؤول",
    submitForgot: "طلب الاسترداد",
    submitTotp: "تحقق وسجّل الدخول",
    submitPasswordChange: "غيّر كلمة المرور وتابع",
    signingIn: "جارٍ تسجيل الدخول...",
    creatingAdmin: "جارٍ إنشاء المسؤول...",
    requestingRecovery: "جارٍ طلب الاسترداد...",
    verifying: "جارٍ التحقق...",
    changingPassword: "جارٍ تغيير كلمة المرور...",
    showPassword: "إظهار كلمة المرور",
    hidePassword: "إخفاء كلمة المرور",
    backToLogin: "العودة إلى تسجيل الدخول",
    loginInvalid: "اسم المستخدم أو كلمة المرور غير صحيحة.",
    totpInvalid: "رمز التحقق غير صالح.",
    passwordChangeFailed: "فشل تغيير كلمة المرور.",
    weakPassword: "يجب أن تحتوي كلمة المرور على 12 حرفًا على الأقل.",
    passwordMismatch: "تأكيد كلمة المرور غير متطابق.",
    requiredFields: "أكمل جميع الحقول المطلوبة.",
    duplicateUsername: "اسم المستخدم هذا مستخدم بالفعل.",
    setupFailed: "فشل إنشاء المسؤول.",
    recoveryFailed: "تعذر إكمال طلب الاسترداد.",
    tooManyAttempts: "محاولات فاشلة كثيرة. حاول لاحقًا.",
    passwordChangeRequired: "للمتابعة، يطلب المسؤول تغيير كلمة المرور.",
    mfaPrompt: "أدخل رمز تطبيق المصادقة أو أحد رموز الاسترداد.",
    createPrompt: "هل أنت جديد في هذا التثبيت؟",
    forgotPrompt: "هل تحتاج مساعدة في الدخول؟",
    featureTitle: "كل ما تحتاجه لإدارة أعمالك بذكاء، في مكان واحد.",
    tagline: "أرقام أذكى، قرارات أقوى",
    features: ["وصول حسب الدور", "جلسات مشفرة", "ضوابط جاهزة للتدقيق", "مالية ملائمة للبلد"],
  },
};

function destinationFor(user) {
  return user?.role === "visitor" ? "/visitor" : "/";
}

function routeMode(pathname) {
  if (pathname === "/register") return "register";
  if (pathname === "/forgot-password") return "forgot";
  return "login";
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const route = routeMode(location.pathname);
  const { login, changePassword, completeTotpLogin } = useAuth();
  const { language, setLanguage, dir } = useLanguage();
  const text = AUTH_TEXT[language] || AUTH_TEXT.en;
  const isRTL = dir === "rtl";

  const [setupStatus, setSetupStatus] = useState({
    loading: true,
    failed: false,
    requiresAdmin: false,
    initialized: false,
    version: APP_VERSION_FALLBACK,
  });
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [setupForm, setSetupForm] = useState({ full_name: "", username: "", password: "", confirm_password: "" });
  const [forgotForm, setForgotForm] = useState({ username: "" });
  const [passwordChange, setPasswordChange] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [mfa, setMfa] = useState({ token: "", code: "" });
  const [secureMode, setSecureMode] = useState(null);
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [errorKey, setErrorKey] = useState("");
  const [noticeKey, setNoticeKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const activeSecureMode = route === "login" ? secureMode : null;
  const visibleNoticeKey = noticeKey || location.state?.noticeKey || "";

  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/setup/status`)
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok || !data) throw new Error("setup status unavailable");
        if (active) {
          setSetupStatus({
            loading: false,
            failed: false,
            requiresAdmin: Boolean(data.requires_admin),
            initialized: Boolean(data.initialized),
            version: data.version || APP_VERSION_FALLBACK,
          });
        }
      })
      .catch(() => {
        if (active) {
          setSetupStatus((current) => ({ ...current, loading: false, failed: true }));
          setErrorKey("serviceUnavailable");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!setupStatus.loading && setupStatus.requiresAdmin && route === "login") {
      navigate("/register", { replace: true });
    }
  }, [navigate, route, setupStatus.loading, setupStatus.requiresAdmin]);

  const activeTitle = useMemo(() => {
    if (activeSecureMode === "totp") return text.verificationCode;
    if (activeSecureMode === "force-password-change") return text.passwordChangeRequired;
    if (route === "register") return setupStatus.requiresAdmin ? text.setupTitle : text.registerTitle;
    if (route === "forgot") return text.forgotTitle;
    return text.welcomeTitle;
  }, [activeSecureMode, route, setupStatus.requiresAdmin, text]);

  const activeSubtitle = useMemo(() => {
    if (activeSecureMode === "totp") return text.mfaPrompt;
    if (activeSecureMode === "force-password-change") return text.passwordChangeRequired;
    if (route === "register") return setupStatus.requiresAdmin ? text.setupSubtitle : text.registerSubtitle;
    if (route === "forgot") return text.forgotSubtitle;
    return text.welcomeSubtitle;
  }, [activeSecureMode, route, setupStatus.requiresAdmin, text]);

  function clearTransientState() {
    setSecureMode(null);
    setErrorKey("");
    setNoticeKey("");
  }

  function togglePassword(key) {
    setVisiblePasswords((current) => ({ ...current, [key]: !current[key] }));
  }

  function validatePasswordPair(password, confirmPassword) {
    if ((password || "").length < 12) {
      setErrorKey("weakPassword");
      return false;
    }
    if (password !== confirmPassword) {
      setErrorKey("passwordMismatch");
      return false;
    }
    return true;
  }

  async function handleLogin(event) {
    event.preventDefault();
    setErrorKey("");
    setNoticeKey("");
    if (!loginForm.username.trim() || !loginForm.password) {
      setErrorKey("requiredFields");
      return;
    }
    setSubmitting(true);
    try {
      const result = await login(loginForm.username.trim(), loginForm.password);
      if (result?.mfaRequired) {
        setMfa({ token: result.mfaToken, code: "" });
        setSecureMode("totp");
        return;
      }
      if (result?.must_change_password) {
        setPasswordChange({ current_password: loginForm.password, new_password: "", confirm_password: "" });
        setSecureMode("force-password-change");
        return;
      }
      navigate(destinationFor(result), { replace: true });
    } catch (loginError) {
      setErrorKey(/too many/i.test(loginError?.message || "") ? "tooManyAttempts" : "loginInvalid");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetup(event) {
    event.preventDefault();
    setErrorKey("");
    setNoticeKey("");
    if (!setupForm.full_name.trim() || !setupForm.username.trim()) {
      setErrorKey("requiredFields");
      return;
    }
    if (!validatePasswordPair(setupForm.password, setupForm.confirm_password)) return;

    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: setupForm.full_name.trim(),
          username: setupForm.username.trim(),
          password: setupForm.password,
          confirm_password: setupForm.confirm_password,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.status !== "created") {
        if (response.status === 409) setErrorKey("duplicateUsername");
        else if (response.status === 403) {
          setSetupStatus((current) => ({ ...current, requiresAdmin: false, initialized: true }));
          setErrorKey("registrationClosedBody");
        } else if (response.status === 400) setErrorKey("weakPassword");
        else setErrorKey("setupFailed");
        return;
      }
      setLoginForm((current) => ({ ...current, username: setupForm.username.trim(), password: "" }));
      navigate("/login", {
        replace: true,
        state: { noticeKey: "firstAdminCreated", username: setupForm.username.trim() },
      });
    } catch {
      setErrorKey("setupFailed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    setErrorKey("");
    setNoticeKey("");
    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: forgotForm.username.trim() }),
      });
      if (!response.ok) throw new Error("recovery failed");
      setNoticeKey("recoveryAccepted");
    } catch {
      setErrorKey("recoveryFailed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTotpLogin(event) {
    event.preventDefault();
    setErrorKey("");
    setSubmitting(true);
    try {
      const signedInUser = await completeTotpLogin(mfa.token, mfa.code.trim());
      if (signedInUser?.must_change_password) {
        setPasswordChange({ current_password: loginForm.password, new_password: "", confirm_password: "" });
        setSecureMode("force-password-change");
        return;
      }
      navigate(destinationFor(signedInUser), { replace: true });
    } catch {
      setErrorKey("totpInvalid");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForcedPasswordChange(event) {
    event.preventDefault();
    setErrorKey("");
    if (!validatePasswordPair(passwordChange.new_password, passwordChange.confirm_password)) return;
    setSubmitting(true);
    try {
      const changedUser = await changePassword(passwordChange.current_password, passwordChange.new_password);
      navigate(destinationFor(changedUser), { replace: true });
    } catch {
      setErrorKey("passwordChangeFailed");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full h-12 rounded-[var(--erp-radius-sm)] border border-[var(--erp-border)] bg-[var(--erp-panel-solid)] ps-11 pe-4 text-[var(--erp-text)] shadow-[var(--erp-inset-shadow)] outline-none placeholder:text-[var(--erp-muted)] focus:border-[var(--erp-accent)] focus:ring-2 focus:ring-[var(--erp-glow)]";

  return (
    <div
      dir={dir}
      className="min-h-dvh h-dvh overflow-y-auto bg-[var(--erp-bg)] text-[var(--erp-text)] px-4 py-4 sm:px-6 sm:py-8"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--erp-accent) 9%, transparent), transparent 42%), linear-gradient(315deg, color-mix(in srgb, var(--erp-accent-2) 8%, transparent), transparent 46%), var(--erp-bg)",
      }}
    >
      <div className="mx-auto grid min-h-[calc(100dvh-2rem)] w-full max-w-7xl items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] lg:gap-12">
        <BrandPanel text={text} isRTL={isRTL} />

        <motion.section
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="erp-surface relative min-w-0 w-full max-w-[440px] justify-self-center rounded-[var(--erp-radius-lg)] p-4 sm:p-6"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0 lg:hidden">
              <div className="sm:hidden">
                <BrandLogo variant="icon" size={54} />
              </div>
              <div className="hidden sm:block">
                <BrandLogo variant="compact" size={210} subtitle="ACCOUNTING" />
              </div>
            </div>
            <div className="ms-auto flex shrink-0 flex-col items-end gap-2">
              <LanguageControl text={text} language={language} setLanguage={setLanguage} />
              <Badge tone="info" aria-label={`${text.versionLabel} ${setupStatus.version}`}>
                v{setupStatus.version}
              </Badge>
              <p className="hidden max-w-[11rem] text-end text-[11px] font-bold leading-tight text-[var(--erp-muted)] sm:block">
                {text.productSubtitle}
              </p>
            </div>
          </div>

          <nav className="mb-5 grid min-w-0 grid-cols-3 gap-1 rounded-[var(--erp-radius-md)] border border-[var(--erp-border)] bg-[var(--erp-panel-solid)] p-1" aria-label={text.authNavigation}>
            <AuthTab to="/login" active={route === "login" && !activeSecureMode} onClick={clearTransientState}>{text.signIn}</AuthTab>
            <AuthTab to="/register" active={route === "register" && !activeSecureMode} onClick={clearTransientState}>{text.createAccount}</AuthTab>
            <AuthTab to="/forgot-password" active={route === "forgot" && !activeSecureMode} onClick={clearTransientState}>{text.forgotPassword}</AuthTab>
          </nav>

          <div className="mb-5">
            <h1 className="text-2xl font-black leading-tight text-[var(--erp-text)]">{activeTitle}</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--erp-muted)]">{activeSubtitle}</p>
          </div>

          {visibleNoticeKey && <Notice tone="success" icon={CheckCircle2} className="mb-4">{text[visibleNoticeKey]}</Notice>}
          {setupStatus.failed && !errorKey && <Notice tone="danger" className="mb-4">{text.serviceUnavailable}</Notice>}

          <AnimatePresence mode="wait" initial={false}>
            {setupStatus.loading ? (
              <CheckingState key="checking" text={text} />
            ) : activeSecureMode === "totp" ? (
              <TotpForm
                key="totp"
                text={text}
                mfa={mfa}
                setMfa={setMfa}
                inputClass={inputClass}
                submitting={submitting}
                error={errorKey ? text[errorKey] : ""}
                onSubmit={handleTotpLogin}
                onBack={() => {
                  setSecureMode(null);
                  setMfa({ token: "", code: "" });
                  setErrorKey("");
                }}
              />
            ) : activeSecureMode === "force-password-change" ? (
              <PasswordChangeForm
                key="password-change"
                text={text}
                passwordChange={passwordChange}
                setPasswordChange={setPasswordChange}
                visiblePasswords={visiblePasswords}
                togglePassword={togglePassword}
                inputClass={inputClass}
                submitting={submitting}
                error={errorKey ? text[errorKey] : ""}
                onSubmit={handleForcedPasswordChange}
              />
            ) : route === "register" ? (
              setupStatus.requiresAdmin ? (
                <SetupForm
                  key="setup"
                  text={text}
                  setupForm={setupForm}
                  setSetupForm={setSetupForm}
                  visiblePasswords={visiblePasswords}
                  togglePassword={togglePassword}
                  inputClass={inputClass}
                  submitting={submitting}
                  error={errorKey ? text[errorKey] : ""}
                  onSubmit={handleSetup}
                />
              ) : (
                <RegistrationClosed key="closed" text={text} />
              )
            ) : route === "forgot" ? (
              <ForgotForm
                key="forgot"
                text={text}
                forgotForm={forgotForm}
                setForgotForm={setForgotForm}
                inputClass={inputClass}
                submitting={submitting}
                error={errorKey ? text[errorKey] : ""}
                onSubmit={handleForgotPassword}
              />
            ) : (
              <LoginForm
                key="login"
                text={text}
                loginForm={loginForm}
                setLoginForm={setLoginForm}
                visiblePasswords={visiblePasswords}
                togglePassword={togglePassword}
                inputClass={inputClass}
                submitting={submitting}
                error={errorKey ? text[errorKey] : ""}
                onSubmit={handleLogin}
                isRTL={isRTL}
              />
            )}
          </AnimatePresence>
        </motion.section>
      </div>
    </div>
  );
}

function LanguageControl({ text, language, setLanguage }) {
  return (
    <label className="inline-flex h-10 items-center gap-2 rounded-[var(--erp-radius-sm)] border border-[var(--erp-border)] bg-[var(--erp-panel-solid)] px-3 text-sm font-bold text-[var(--erp-text)]">
      <Globe2 size={16} className="shrink-0 text-[var(--erp-accent)]" />
      <span className="sr-only">{text.language}</span>
      <select
        aria-label={text.language}
        value={language}
        onChange={(event) => setLanguage(event.target.value)}
        className="h-8 min-w-[104px] border-0 bg-transparent text-sm font-bold text-[var(--erp-text)] outline-none"
      >
        {LANGUAGE_OPTIONS.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function AuthTab({ to, active, onClick, children }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex min-h-10 min-w-0 items-center justify-center rounded-[var(--erp-radius-sm)] px-1 text-center text-[11px] font-black leading-tight sm:px-2 sm:text-xs"
      style={{
        background: active ? "var(--erp-glow)" : "transparent",
        color: active ? "var(--erp-accent)" : "var(--erp-muted)",
      }}
    >
      {children}
    </Link>
  );
}

function CheckingState({ text }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="py-12 text-center text-[var(--erp-accent)]"
    >
      <ShieldCheck size={40} className="mx-auto mb-3" />
      <div className="font-black">{text.checkingTitle}</div>
      <div className="mt-2 text-sm text-[var(--erp-muted)]">{text.checkingBody}</div>
    </motion.div>
  );
}

function LoginForm({ text, loginForm, setLoginForm, visiblePasswords, togglePassword, inputClass, submitting, error, onSubmit, isRTL }) {
  return (
    <AuthMotionForm onSubmit={onSubmit}>
      <FieldLabel htmlFor="username">{text.username}</FieldLabel>
      <IconInput icon={User}>
        <input
          id="username"
          autoComplete="username"
          value={loginForm.username}
          onChange={(event) => setLoginForm({ ...loginForm, username: event.target.value })}
          placeholder={text.usernamePlaceholder}
          className={inputClass}
          required
        />
      </IconInput>

      <FieldLabel htmlFor="password">{text.password}</FieldLabel>
      <PasswordInput
        id="password"
        autoComplete="current-password"
        value={loginForm.password}
        onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })}
        placeholder={text.passwordPlaceholder}
        visible={Boolean(visiblePasswords.login)}
        onToggle={() => togglePassword("login")}
        inputClass={inputClass}
        text={text}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-[var(--erp-muted)]">{text.forgotPrompt}</span>
        <Link className="font-black text-[var(--erp-accent)]" to="/forgot-password">{text.forgotPassword}</Link>
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-[var(--erp-muted)]">{text.createPrompt}</span>
        <Link className="font-black text-[var(--erp-accent)]" to="/register">{text.createAccount}</Link>
      </div>

      {error && <Notice tone="danger" className="mb-4">{error}</Notice>}
      <SubmitButton submitting={submitting} loadingText={text.signingIn}>
        <span>{text.submitLogin}</span>
        {!submitting && <ArrowLeft size={18} className={isRTL ? "" : "rotate-180"} />}
      </SubmitButton>
    </AuthMotionForm>
  );
}

function SetupForm({ text, setupForm, setSetupForm, visiblePasswords, togglePassword, inputClass, submitting, error, onSubmit }) {
  return (
    <AuthMotionForm onSubmit={onSubmit}>
      <Notice tone="success" icon={UserPlus} className="mb-5">{text.firstRunNotice}</Notice>

      <FieldLabel htmlFor="setup-full-name">{text.fullName}</FieldLabel>
      <IconInput icon={User}>
        <input
          id="setup-full-name"
          autoComplete="name"
          value={setupForm.full_name}
          onChange={(event) => setSetupForm({ ...setupForm, full_name: event.target.value })}
          placeholder={text.fullNamePlaceholder}
          className={inputClass}
          required
        />
      </IconInput>

      <FieldLabel htmlFor="setup-username">{text.username}</FieldLabel>
      <IconInput icon={User}>
        <input
          id="setup-username"
          autoComplete="username"
          value={setupForm.username}
          onChange={(event) => setSetupForm({ ...setupForm, username: event.target.value })}
          placeholder={text.usernamePlaceholder}
          className={inputClass}
          required
        />
      </IconInput>

      <FieldLabel htmlFor="setup-password">{text.password}</FieldLabel>
      <PasswordInput
        id="setup-password"
        autoComplete="new-password"
        value={setupForm.password}
        onChange={(event) => setSetupForm({ ...setupForm, password: event.target.value })}
        placeholder={text.newPasswordPlaceholder}
        visible={Boolean(visiblePasswords.setup)}
        onToggle={() => togglePassword("setup")}
        inputClass={inputClass}
        text={text}
      />

      <FieldLabel htmlFor="setup-confirm-password">{text.confirmPassword}</FieldLabel>
      <PasswordInput
        id="setup-confirm-password"
        autoComplete="new-password"
        value={setupForm.confirm_password}
        onChange={(event) => setSetupForm({ ...setupForm, confirm_password: event.target.value })}
        placeholder={text.confirmPasswordPlaceholder}
        visible={Boolean(visiblePasswords.setupConfirm)}
        onToggle={() => togglePassword("setupConfirm")}
        inputClass={inputClass}
        text={text}
      />

      {error && <Notice tone="danger" className="mb-4">{error}</Notice>}
      <SubmitButton submitting={submitting} loadingText={text.creatingAdmin} tone="success">
        <CheckCircle2 size={19} />
        <span>{text.submitSetup}</span>
      </SubmitButton>
    </AuthMotionForm>
  );
}

function RegistrationClosed({ text }) {
  return (
    <motion.div
      key="registration-closed"
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.25, ease: EASE }}
    >
      <Notice tone="info" icon={ShieldCheck} className="mb-5">
        <strong className="mb-2 block">{text.registrationClosedTitle}</strong>
        {text.registrationClosedBody}
      </Notice>
      <Link
        to="/login"
        className="flex min-h-12 w-full items-center justify-center rounded-[var(--erp-radius-md)] bg-[var(--erp-glow)] px-4 text-sm font-black text-[var(--erp-accent)]"
      >
        {text.backToLogin}
      </Link>
    </motion.div>
  );
}

function ForgotForm({ text, forgotForm, setForgotForm, inputClass, submitting, error, onSubmit }) {
  return (
    <AuthMotionForm onSubmit={onSubmit}>
      <Notice tone="info" icon={MailQuestion} className="mb-5">{text.recoveryNotice}</Notice>

      <FieldLabel htmlFor="forgot-username">{text.username}</FieldLabel>
      <IconInput icon={User}>
        <input
          id="forgot-username"
          autoComplete="username"
          value={forgotForm.username}
          onChange={(event) => setForgotForm({ username: event.target.value })}
          placeholder={text.usernamePlaceholder}
          className={inputClass}
        />
      </IconInput>

      {error && <Notice tone="danger" className="mb-4">{error}</Notice>}
      <SubmitButton submitting={submitting} loadingText={text.requestingRecovery}>
        <KeyRound size={18} />
        <span>{text.submitForgot}</span>
      </SubmitButton>
      <Link className="mt-4 block text-center text-sm font-black text-[var(--erp-accent)]" to="/login">
        {text.backToLogin}
      </Link>
    </AuthMotionForm>
  );
}

function TotpForm({ text, mfa, setMfa, inputClass, submitting, error, onSubmit, onBack }) {
  return (
    <AuthMotionForm onSubmit={onSubmit}>
      <Notice tone="info" icon={ShieldCheck} className="mb-5">{text.mfaPrompt}</Notice>
      <FieldLabel htmlFor="totp-code">{text.verificationCode}</FieldLabel>
      <IconInput icon={KeyRound}>
        <input
          id="totp-code"
          autoComplete="one-time-code"
          value={mfa.code}
          onChange={(event) => setMfa({ ...mfa, code: event.target.value })}
          placeholder={text.verificationPlaceholder}
          className={inputClass}
          required
          autoFocus
        />
      </IconInput>

      {error && <Notice tone="danger" className="mb-4">{error}</Notice>}
      <SubmitButton submitting={submitting} loadingText={text.verifying}>
        <ShieldCheck size={18} />
        <span>{text.submitTotp}</span>
      </SubmitButton>
      <button type="button" onClick={onBack} className="mt-4 w-full text-sm font-black text-[var(--erp-muted)] hover:text-[var(--erp-text)]">
        {text.backToLogin}
      </button>
    </AuthMotionForm>
  );
}

function PasswordChangeForm({ text, passwordChange, setPasswordChange, visiblePasswords, togglePassword, inputClass, submitting, error, onSubmit }) {
  return (
    <AuthMotionForm onSubmit={onSubmit}>
      <Notice tone="warning" icon={KeyRound} className="mb-5">{text.passwordChangeRequired}</Notice>

      <FieldLabel htmlFor="new-password">{text.newPassword}</FieldLabel>
      <PasswordInput
        id="new-password"
        autoComplete="new-password"
        value={passwordChange.new_password}
        onChange={(event) => setPasswordChange({ ...passwordChange, new_password: event.target.value })}
        placeholder={text.newPasswordPlaceholder}
        visible={Boolean(visiblePasswords.newPassword)}
        onToggle={() => togglePassword("newPassword")}
        inputClass={inputClass}
        text={text}
      />

      <FieldLabel htmlFor="confirm-new-password">{text.confirmNewPassword}</FieldLabel>
      <PasswordInput
        id="confirm-new-password"
        autoComplete="new-password"
        value={passwordChange.confirm_password}
        onChange={(event) => setPasswordChange({ ...passwordChange, confirm_password: event.target.value })}
        placeholder={text.confirmPasswordPlaceholder}
        visible={Boolean(visiblePasswords.confirmNewPassword)}
        onToggle={() => togglePassword("confirmNewPassword")}
        inputClass={inputClass}
        text={text}
      />

      {error && <Notice tone="danger" className="mb-4">{error}</Notice>}
      <SubmitButton submitting={submitting} loadingText={text.changingPassword} tone="warning">
        <span>{text.submitPasswordChange}</span>
      </SubmitButton>
    </AuthMotionForm>
  );
}

function AuthMotionForm({ children, onSubmit }) {
  return (
    <motion.form
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.25, ease: EASE }}
      onSubmit={onSubmit}
      className="min-w-0"
    >
      {children}
    </motion.form>
  );
}

function FieldLabel({ htmlFor, children }) {
  return (
    <label className="mb-2 mt-4 block text-sm font-bold text-[var(--erp-muted)] first:mt-0" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

function IconInput({ icon: Icon, children }) {
  return (
    <div className="relative mb-1">
      <span className="pointer-events-none absolute inset-y-0 start-4 flex items-center text-[var(--erp-muted)]">
        <Icon size={18} />
      </span>
      {children}
    </div>
  );
}

function PasswordInput({ id, autoComplete, value, onChange, placeholder, visible, onToggle, inputClass, text }) {
  return (
    <div className="relative mb-1">
      <span className="pointer-events-none absolute inset-y-0 start-4 flex items-center text-[var(--erp-muted)]">
        <Lock size={18} />
      </span>
      <input
        id={id}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        type={visible ? "text" : "password"}
        className={`${inputClass} pe-12`}
        minLength={12}
        required
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={visible ? text.hidePassword : text.showPassword}
        className="absolute inset-y-1 end-1 flex w-10 items-center justify-center rounded-[var(--erp-radius-sm)] text-[var(--erp-muted)] hover:bg-[var(--erp-glow)] hover:text-[var(--erp-text)]"
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

function SubmitButton({ submitting, loadingText, tone = "accent", children }) {
  const reduceMotion = useReducedMotion();
  const palette = {
    accent: ["var(--erp-accent)", "var(--erp-accent-2)", "var(--erp-on-accent)"],
    success: ["var(--erp-success-solid)", "var(--erp-success-solid)", "var(--erp-success-solid-text)"],
    warning: ["var(--erp-warning-solid)", "var(--erp-warning-solid)", "var(--erp-warning-solid-text)"],
  }[tone];

  return (
    <motion.button
      type="submit"
      disabled={submitting}
      whileHover={submitting || reduceMotion ? {} : { scale: 1.01, y: -1 }}
      whileTap={submitting || reduceMotion ? {} : { scale: 0.99 }}
      className="vitalix-btn-sweep relative mt-2 flex min-h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-[var(--erp-radius-md)] px-4 text-sm font-black disabled:opacity-60"
      style={{
        background: `linear-gradient(110deg, ${palette[0]}, ${palette[1]})`,
        color: palette[2],
        boxShadow: "0 14px 30px -18px var(--erp-accent)",
      }}
    >
      {submitting ? (
        <>
          <Loader2 size={18} className="animate-spin" />
          <span>{loadingText}</span>
        </>
      ) : children}
    </motion.button>
  );
}

function BrandPanel({ text, isRTL }) {
  return (
    <section className="hidden min-w-0 lg:block">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE }}
        className="relative max-w-2xl"
      >
        <div className="mb-8 flex items-center gap-8">
          <BrandLogo variant="full" size={360} />
          <img
            src={heroArtwork}
            alt=""
            aria-hidden="true"
            className="w-32 shrink-0 opacity-90 drop-shadow-2xl xl:w-40"
          />
        </div>
        <div className="mb-4 text-xs font-black uppercase tracking-[0.22em] text-[var(--erp-muted)]">{text.tagline}</div>
        <h2 className="max-w-xl text-3xl font-black leading-tight xl:text-4xl">{text.featureTitle}</h2>
        <div className="mt-7 grid max-w-xl grid-cols-2 gap-3">
          {text.features.map((feature, index) => (
            <motion.div
              key={feature}
              initial={{ opacity: 0, x: isRTL ? 18 : -18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.08 * index, ease: EASE }}
              className="flex min-h-12 items-center gap-3 rounded-[var(--erp-radius-md)] border border-[var(--erp-border)] bg-[var(--erp-panel)] px-3 text-sm font-bold"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--erp-radius-sm)] bg-[var(--erp-glow)] text-[var(--erp-accent)]">
                <Sparkles size={16} />
              </span>
              <span className="min-w-0 leading-snug">{feature}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
