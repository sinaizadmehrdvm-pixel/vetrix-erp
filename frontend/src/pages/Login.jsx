import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  KeyRound,
  ShieldCheck,
  UserPlus,
  Sparkles,
  Calculator,
  Mic,
  User,
  Lock,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../localization/useLanguage";
import { API_URL } from "../services/api";
import Badge from "../components/ui/Badge";
import Notice from "../components/ui/Notice";

const FEATURES = [
  {
    icon: Calculator,
    fa: "حسابداری و خزانه‌داری حرفه‌ای",
    ar: "محاسبة وخزينة احترافية",
    tr: "Profesyonel muhasebe ve hazine yönetimi",
    en: "Professional accounting & treasury",
  },
  {
    icon: Sparkles,
    fa: "هوش تجاری و پیش‌بینی هوشمند",
    ar: "ذكاء أعمال مدعوم بالذكاء الاصطناعي",
    tr: "Yapay zekâ destekli iş zekâsı",
    en: "AI-powered business intelligence",
  },
  {
    icon: Mic,
    fa: "گزارش‌دهی و درخواست‌های صوتی",
    ar: "تقارير وطلبات صوتية",
    tr: "Sesli raporlama ve talepler",
    en: "Voice-driven reports & requests",
  },
  {
    icon: ShieldCheck,
    fa: "امنیت چندلایه و رمزنگاری‌شده",
    ar: "أمان متعدد الطبقات ومشفّر",
    tr: "Katmanlı ve şifrelenmiş güvenlik",
    en: "Layered, encrypted security",
  },
];

const EASE = [0.16, 1, 0.3, 1];

export default function Login() {
  const navigate = useNavigate();
  const { login, changePassword, completeTotpLogin } = useAuth();
  const { language, dir } = useLanguage();
  const fa = language === "fa";

  const [mode, setMode] = useState("checking");
  const [form, setForm] = useState({ username: "", password: "" });
  const [passwordChange, setPasswordChange] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [mfa, setMfa] = useState({ token: "", code: "" });
  const [setup, setSetup] = useState({
    full_name: "",
    username: "",
    password: "",
    confirm_password: "",
  });
  const [version, setVersion] = useState("1.1.0");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/setup/status`)
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok || !data) throw new Error("Setup status unavailable");
        if (active) {
          setVersion(data.version || "1.1.0");
          setMode(data.requires_admin ? "setup" : "login");
        }
      })
      .catch(() => {
        if (active) {
          setMode("login");
          setError(
            fa
              ? "ارتباط با سرویس Vetrix برقرار نشد. چند ثانیه بعد دوباره تلاش کنید."
              : language === "ar"
              ? "تعذّر الاتصال بخدمة Vetrix. يُرجى إعادة المحاولة خلال ثوانٍ قليلة."
              : language === "tr"
              ? "Vetrix hizmetine ulaşılamıyor. Birkaç saniye sonra tekrar deneyin."
              : "Vetrix service is not reachable. Retry in a few seconds.",
          );
        }
      });
    return () => { active = false; };
  }, [language, fa]);

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await login(form.username.trim(), form.password);
      if (result?.mfaRequired) {
        setMfa({ token: result.mfaToken, code: "" });
        setMode("totp");
        return;
      }
      if (result?.must_change_password) {
        setPasswordChange({ current_password: form.password, new_password: "", confirm_password: "" });
        setMode("force-password-change");
        return;
      }
      navigate("/", { replace: true });
    } catch (loginError) {
      setError(
        loginError?.message ||
          (fa
            ? "نام کاربری یا رمز عبور صحیح نیست."
            : language === "ar"
            ? "اسم المستخدم أو كلمة المرور غير صحيحة."
            : language === "tr"
            ? "Kullanıcı adı veya parola hatalı."
            : "Invalid username or password."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTotpLogin(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const signedInUser = await completeTotpLogin(mfa.token, mfa.code.trim());
      if (signedInUser?.must_change_password) {
        setPasswordChange({ current_password: "", new_password: "", confirm_password: "" });
        setMode("force-password-change");
        return;
      }
      navigate("/", { replace: true });
    } catch (totpError) {
      setError(
        totpError?.message ||
          (fa
            ? "کد وارد شده صحیح نیست."
            : language === "ar"
            ? "الرمز المُدخل غير صالح."
            : language === "tr"
            ? "Girilen kod geçerli değil."
            : "That code isn't valid."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForcedPasswordChange(event) {
    event.preventDefault();
    setError("");
    if (passwordChange.new_password.length < 12) {
      setError(
        fa
          ? "رمز عبور جدید باید حداقل ۱۲ نویسه باشد."
          : language === "ar"
          ? "يجب أن تتكوّن كلمة المرور الجديدة من 12 حرفًا على الأقل."
          : language === "tr"
          ? "Yeni parola en az 12 karakter içermelidir."
          : "New password must contain at least 12 characters.",
      );
      return;
    }
    if (passwordChange.new_password !== passwordChange.confirm_password) {
      setError(
        fa
          ? "تکرار رمز عبور جدید مطابقت ندارد."
          : language === "ar"
          ? "تأكيد كلمة المرور الجديدة غير متطابق."
          : language === "tr"
          ? "Yeni parola onayı eşleşmiyor."
          : "New password confirmation does not match.",
      );
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(passwordChange.current_password, passwordChange.new_password);
      navigate("/", { replace: true });
    } catch (changeError) {
      setError(
        changeError?.message ||
          (fa
            ? "تغییر رمز عبور انجام نشد."
            : language === "ar"
            ? "فشل تغيير كلمة المرور."
            : language === "tr"
            ? "Parola değişikliği başarısız oldu."
            : "Password change failed."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetup(event) {
    event.preventDefault();
    setError("");
    if (setup.password.length < 10) {
      setError(
        fa
          ? "رمز عبور باید حداقل ۱۰ کاراکتر باشد."
          : language === "ar"
          ? "يجب أن تتكوّن كلمة المرور من 10 أحرف على الأقل."
          : language === "tr"
          ? "Parola en az 10 karakter içermelidir."
          : "Password must contain at least 10 characters.",
      );
      return;
    }
    if (setup.password !== setup.confirm_password) {
      setError(
        fa
          ? "تکرار رمز عبور مطابقت ندارد."
          : language === "ar"
          ? "تأكيد كلمة المرور غير متطابق."
          : language === "tr"
          ? "Parola onayı eşleşmiyor."
          : "Password confirmation does not match.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: setup.full_name.trim(),
          username: setup.username.trim(),
          password: setup.password,
          role: "admin",
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.status !== "created") {
        throw new Error(data?.detail || data?.message || "Administrator setup failed");
      }
      await login(setup.username.trim(), setup.password);
      navigate("/", { replace: true });
    } catch (setupError) {
      setError(
        setupError?.message ||
          (fa
            ? "ساخت مدیر انجام نشد."
            : language === "ar"
            ? "فشل إعداد المسؤول."
            : language === "tr"
            ? "Yönetici kurulumu başarısız oldu."
            : "Administrator setup failed."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full mb-4 py-4 ps-12 pe-4 rounded-[var(--erp-radius-sm)] bg-[var(--erp-panel-solid)] text-[var(--erp-text)] outline-none border border-transparent focus:border-[var(--erp-accent)] focus:ring-2 focus:ring-[var(--erp-glow)] transition-all duration-200";

  return (
    <div dir={dir} className="relative min-h-screen overflow-hidden bg-[var(--erp-bg)] text-[var(--erp-text)] flex items-center justify-center px-4 py-10">
      <AnimatedBackground />

      <div className="relative z-10 w-full max-w-6xl grid lg:grid-cols-[1.05fr_1fr] gap-10 xl:gap-16 items-center">
        <BrandPanel fa={fa} language={language} />

        <motion.section
          initial={{ opacity: 0, y: 28, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.65, ease: EASE }}
          className="relative w-full max-w-md mx-auto lg:mx-0 lg:justify-self-start rounded-[var(--erp-radius-lg)] border border-[var(--erp-border)] bg-[var(--erp-panel)] backdrop-blur-2xl p-7 sm:p-9 overflow-hidden"
          style={{ boxShadow: "0 30px 90px -25px var(--erp-glow), 0 1px 0 0 var(--erp-border)" }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -inset-inline-end-24 w-56 h-56 rounded-full opacity-40 blur-3xl"
            style={{ background: "radial-gradient(circle, var(--erp-accent), transparent 70%)" }}
          />

          <div className="relative flex items-center gap-3 mb-6 lg:hidden">
            <LogoMark size={44} />
            <div className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-[var(--erp-accent)] to-[var(--erp-accent-2)]">
              Vetrix ERP
            </div>
          </div>

          <div className="relative flex items-center justify-between gap-3 mb-2">
            <h1 className="text-2xl sm:text-3xl font-black text-[var(--erp-text)]">
              {mode === "setup"
                ? fa
                  ? "راه‌اندازی اولیه"
                  : language === "ar"
                  ? "الإعداد الأولي"
                  : language === "tr"
                  ? "İlk kurulum"
                  : "First-run setup"
                : fa
                ? "خوش آمدید"
                : language === "ar"
                ? "مرحبًا بعودتك"
                : language === "tr"
                ? "Tekrar hoş geldiniz"
                : "Welcome back"}
            </h1>
            <Badge tone="info">v{version}</Badge>
          </div>
          <p className="relative text-[var(--erp-muted)] mb-7 text-sm">
            {mode === "setup"
              ? fa
                ? "راه‌اندازی امن و ساخت مدیر اولیه"
                : language === "ar"
                ? "إعداد أولي آمن وإنشاء المسؤول"
                : language === "tr"
                ? "Güvenli ilk kurulum ve yönetici oluşturma"
                : "Secure first-run administrator setup"
              : fa
                ? "سیستم حرفه‌ای حسابداری و مدیریت"
                : language === "ar"
                ? "نظام محاسبي وإداري احترافي"
                : language === "tr"
                ? "Profesyonel Muhasebe Sistemi"
                : "Professional Accounting System"}
          </p>

          <AnimatePresence initial={false}>
            {mode === "checking" && (
              <motion.div
                key="checking"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="relative py-14 text-center text-[var(--erp-accent)]"
              >
                <motion.div
                  animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                  className="inline-flex mb-4"
                >
                  <ShieldCheck size={42} />
                </motion.div>
                <div>
                  {fa
                    ? "در حال بررسی نصب..."
                    : language === "ar"
                    ? "جارٍ التحقق من التثبيت..."
                    : language === "tr"
                    ? "Kurulum kontrol ediliyor..."
                    : "Checking installation..."}
                </div>
              </motion.div>
            )}

            {mode === "setup" && (
              <motion.form
                key="setup"
                initial={{ opacity: 0, x: fa ? -16 : 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: fa ? 16 : -16 }}
                transition={{ duration: 0.35, ease: EASE }}
                onSubmit={handleSetup}
                className="relative"
              >
                <Notice tone="success" icon={UserPlus} className="mb-5">
                  {fa
                    ? "این اولین اجرای Vetrix است. مدیر اولیه را بسازید؛ این مرحله فقط یک‌بار نمایش داده می‌شود."
                    : language === "ar"
                    ? "هذا هو أول تشغيل لنظام Vetrix. أنشئ حساب المسؤول الأولي؛ ستظهر هذه الخطوة مرة واحدة فقط."
                    : language === "tr"
                    ? "Bu, Vetrix'in ilk çalıştırmasıdır. İlk yöneticiyi oluşturun; bu adım yalnızca bir kez görüntülenir."
                    : "This is the first Vetrix run. Create the initial administrator; this step appears only once."}
                </Notice>
                <label className="block text-sm text-[var(--erp-muted)] mb-2" htmlFor="full-name">
                  {fa
                    ? "نام و نام خانوادگی مدیر"
                    : language === "ar"
                    ? "الاسم الكامل للمسؤول"
                    : language === "tr"
                    ? "Yönetici tam adı"
                    : "Administrator full name"}
                </label>
                <IconInput icon={User}>
                  <input id="full-name" autoComplete="name" value={setup.full_name} onChange={(event) => setSetup({ ...setup, full_name: event.target.value })} className={inputClass} required />
                </IconInput>

                <label className="block text-sm text-[var(--erp-muted)] mb-2" htmlFor="setup-username">
                  {fa
                    ? "نام کاربری مدیر"
                    : language === "ar"
                    ? "اسم مستخدم المسؤول"
                    : language === "tr"
                    ? "Yönetici kullanıcı adı"
                    : "Administrator username"}
                </label>
                <IconInput icon={User}>
                  <input id="setup-username" autoComplete="username" value={setup.username} onChange={(event) => setSetup({ ...setup, username: event.target.value })} className={inputClass} required />
                </IconInput>

                <label className="block text-sm text-[var(--erp-muted)] mb-2" htmlFor="setup-password">
                  {fa
                    ? "رمز عبور قوی (حداقل ۱۰ کاراکتر)"
                    : language === "ar"
                    ? "كلمة مرور قوية (10 أحرف على الأقل)"
                    : language === "tr"
                    ? "Güçlü parola (en az 10 karakter)"
                    : "Strong password (minimum 10 characters)"}
                </label>
                <IconInput icon={Lock}>
                  <input id="setup-password" autoComplete="new-password" type="password" value={setup.password} onChange={(event) => setSetup({ ...setup, password: event.target.value })} className={inputClass} minLength={10} required />
                </IconInput>

                <label className="block text-sm text-[var(--erp-muted)] mb-2" htmlFor="confirm-password">
                  {fa
                    ? "تکرار رمز عبور"
                    : language === "ar"
                    ? "تأكيد كلمة المرور"
                    : language === "tr"
                    ? "Parolayı onayla"
                    : "Confirm password"}
                </label>
                <IconInput icon={Lock}>
                  <input id="confirm-password" autoComplete="new-password" type="password" value={setup.confirm_password} onChange={(event) => setSetup({ ...setup, confirm_password: event.target.value })} className={inputClass} minLength={10} required />
                </IconInput>

                {error && <Notice tone="danger">{error}</Notice>}
                <SubmitButton submitting={submitting} from="#34d399" to="#22d3ee">
                  <CheckCircle2 size={19} />
                  {submitting
                    ? fa
                      ? "در حال راه‌اندازی..."
                      : language === "ar"
                      ? "جارٍ الإعداد..."
                      : language === "tr"
                      ? "Kuruluyor..."
                      : "Setting up..."
                    : fa
                    ? "ساخت مدیر و ورود"
                    : language === "ar"
                    ? "إنشاء المسؤول وتسجيل الدخول"
                    : language === "tr"
                    ? "Yönetici oluştur ve giriş yap"
                    : "Create administrator & sign in"}
                </SubmitButton>
              </motion.form>
            )}

            {mode === "force-password-change" && (
              <motion.form
                key="force-password-change"
                initial={{ opacity: 0, x: fa ? -16 : 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: fa ? 16 : -16 }}
                transition={{ duration: 0.35, ease: EASE }}
                onSubmit={handleForcedPasswordChange}
                className="relative"
              >
                <Notice tone="warning" icon={KeyRound} className="mb-5">
                  {fa
                    ? "برای ادامه، بنا به سیاست امنیتی مدیر باید رمز عبور خود را تغییر دهید."
                    : language === "ar"
                    ? "للمتابعة، تقتضي سياسة الأمان الخاصة بالمسؤول تغيير كلمة المرور الخاصة بك."
                    : language === "tr"
                    ? "Devam etmek için yönetici güvenlik politikası gereği parolanızı değiştirmeniz gerekiyor."
                    : "To continue, your administrator requires you to change your password."}
                </Notice>
                <label className="block text-sm text-[var(--erp-muted)] mb-2" htmlFor="new-password">
                  {fa
                    ? "رمز عبور جدید"
                    : language === "ar"
                    ? "كلمة المرور الجديدة"
                    : language === "tr"
                    ? "Yeni parola"
                    : "New password"}
                </label>
                <IconInput icon={Lock}>
                  <input id="new-password" autoComplete="new-password" type="password" value={passwordChange.new_password} onChange={(event) => setPasswordChange({ ...passwordChange, new_password: event.target.value })} className={inputClass} minLength={12} required />
                </IconInput>

                <label className="block text-sm text-[var(--erp-muted)] mb-2" htmlFor="confirm-new-password">
                  {fa
                    ? "تکرار رمز عبور جدید"
                    : language === "ar"
                    ? "تأكيد كلمة المرور الجديدة"
                    : language === "tr"
                    ? "Yeni parolayı onayla"
                    : "Confirm new password"}
                </label>
                <IconInput icon={Lock}>
                  <input id="confirm-new-password" autoComplete="new-password" type="password" value={passwordChange.confirm_password} onChange={(event) => setPasswordChange({ ...passwordChange, confirm_password: event.target.value })} className={inputClass} minLength={12} required />
                </IconInput>

                {error && <Notice tone="danger">{error}</Notice>}
                <SubmitButton submitting={submitting} from="#fbbf24" to="#f59e0b">
                  {submitting
                    ? fa
                      ? "در حال تغییر رمز..."
                      : language === "ar"
                      ? "جارٍ تغيير كلمة المرور..."
                      : language === "tr"
                      ? "Parola değiştiriliyor..."
                      : "Changing password..."
                    : fa
                    ? "تغییر رمز و ادامه"
                    : language === "ar"
                    ? "تغيير كلمة المرور والمتابعة"
                    : language === "tr"
                    ? "Parolayı değiştir ve devam et"
                    : "Change password & continue"}
                </SubmitButton>
              </motion.form>
            )}

            {mode === "totp" && (
              <motion.form
                key="totp"
                initial={{ opacity: 0, x: fa ? -16 : 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: fa ? 16 : -16 }}
                transition={{ duration: 0.35, ease: EASE }}
                onSubmit={handleTotpLogin}
                className="relative"
              >
                <Notice tone="info" icon={ShieldCheck} className="mb-5">
                  {fa
                    ? "کد شش‌رقمی برنامه احراز هویت یا یکی از کدهای بازیابی را وارد کنید."
                    : language === "ar"
                    ? "أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة، أو أحد رموز الاسترداد."
                    : language === "tr"
                    ? "Kimlik doğrulama uygulamanızdaki 6 haneli kodu veya bir kurtarma kodunu girin."
                    : "Enter the 6-digit code from your authenticator app, or a recovery code."}
                </Notice>
                <label className="block text-sm text-[var(--erp-muted)] mb-2" htmlFor="totp-code">
                  {fa
                    ? "کد تأیید"
                    : language === "ar"
                    ? "رمز التحقق"
                    : language === "tr"
                    ? "Doğrulama kodu"
                    : "Verification code"}
                </label>
                <IconInput icon={KeyRound}>
                  <input
                    id="totp-code"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    value={mfa.code}
                    onChange={(event) => setMfa({ ...mfa, code: event.target.value })}
                    className={inputClass}
                    required
                    autoFocus
                  />
                </IconInput>

                {error && <Notice tone="danger">{error}</Notice>}
                <SubmitButton submitting={submitting} from="var(--erp-accent)" to="var(--erp-accent-2)">
                  {submitting
                    ? fa
                      ? "در حال بررسی..."
                      : language === "ar"
                      ? "جارٍ التحقق..."
                      : language === "tr"
                      ? "Doğrulanıyor..."
                      : "Verifying..."
                    : fa
                    ? "تأیید و ورود"
                    : language === "ar"
                    ? "تحقق وتسجيل الدخول"
                    : language === "tr"
                    ? "Doğrula ve giriş yap"
                    : "Verify & sign in"}
                </SubmitButton>
                <button
                  type="button"
                  onClick={() => { setMode("login"); setMfa({ token: "", code: "" }); setError(""); }}
                  className="w-full mt-3 text-sm text-[var(--erp-muted)] hover:text-[var(--erp-text)] transition-colors"
                >
                  {fa
                    ? "بازگشت به ورود"
                    : language === "ar"
                    ? "العودة إلى تسجيل الدخول"
                    : language === "tr"
                    ? "Girişe dön"
                    : "Back to login"}
                </button>
              </motion.form>
            )}

            {mode === "login" && (
              <motion.form
                key="login"
                initial={{ opacity: 0, x: fa ? -16 : 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: fa ? 16 : -16 }}
                transition={{ duration: 0.35, ease: EASE }}
                onSubmit={handleLogin}
                className="relative"
              >
                <label className="block text-sm text-[var(--erp-muted)] mb-2" htmlFor="username">
                  {fa
                    ? "نام کاربری"
                    : language === "ar"
                    ? "اسم المستخدم"
                    : language === "tr"
                    ? "Kullanıcı adı"
                    : "Username"}
                </label>
                <IconInput icon={User}>
                  <input id="username" autoComplete="username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} className={inputClass} required />
                </IconInput>

                <label className="block text-sm text-[var(--erp-muted)] mb-2" htmlFor="password">
                  {fa
                    ? "رمز عبور"
                    : language === "ar"
                    ? "كلمة المرور"
                    : language === "tr"
                    ? "Parola"
                    : "Password"}
                </label>
                <IconInput icon={Lock}>
                  <input id="password" autoComplete="current-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} type="password" className={inputClass} required />
                </IconInput>

                {error && <Notice tone="danger">{error}</Notice>}
                <SubmitButton submitting={submitting} from="var(--erp-accent)" to="var(--erp-accent-2)">
                  {submitting
                    ? fa
                      ? "در حال ورود..."
                      : language === "ar"
                      ? "جارٍ تسجيل الدخول..."
                      : language === "tr"
                      ? "Giriş yapılıyor..."
                      : "Signing in..."
                    : fa
                    ? "ورود"
                    : language === "ar"
                    ? "تسجيل الدخول"
                    : language === "tr"
                    ? "Giriş yap"
                    : "Login"}
                  {!submitting && <ArrowLeft size={18} className={fa ? "" : "rotate-180"} />}
                </SubmitButton>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.section>
      </div>
    </div>
  );
}

function IconInput({ icon: Icon, children }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 start-4 flex items-center text-[var(--erp-muted)]">
        <Icon size={18} />
      </span>
      {children}
    </div>
  );
}

function SubmitButton({ submitting, from, to, children }) {
  return (
    <motion.button
      type="submit"
      disabled={submitting}
      whileHover={submitting ? {} : { scale: 1.015, y: -1 }}
      whileTap={submitting ? {} : { scale: 0.98 }}
      className="w-full text-black font-black py-4 rounded-[var(--erp-radius-md)] disabled:opacity-60 flex items-center justify-center gap-2 transition-shadow"
      style={{
        background: `linear-gradient(110deg, ${from}, ${to})`,
        boxShadow: `0 12px 30px -10px ${from === "var(--erp-accent)" ? "var(--erp-glow)" : `${from}55`}`,
      }}
    >
      {submitting && <Loader2 size={18} className="animate-spin" />}
      {children}
    </motion.button>
  );
}

function LogoMark({ size = 56 }) {
  return (
    <motion.div
      animate={{ boxShadow: ["0 0 0px var(--erp-glow)", "0 0 28px var(--erp-glow)", "0 0 0px var(--erp-glow)"] }}
      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      className="flex items-center justify-center rounded-[var(--erp-radius-lg)] font-black text-black shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        background: "linear-gradient(135deg, var(--erp-accent), var(--erp-accent-2))",
      }}
    >
      V
    </motion.div>
  );
}

function BrandPanel({ fa, language }) {
  return (
    <div className="hidden lg:flex flex-col justify-center relative z-10 px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="flex items-center gap-4 mb-8"
      >
        <LogoMark size={64} />
        <div>
          <div className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-[var(--erp-accent)] to-[var(--erp-accent-2)]">
            Vetrix ERP
          </div>
          <div className="text-[var(--erp-muted)] text-sm mt-1">
            {fa
              ? "پلتفرم یکپارچه مدیریت کسب‌وکار"
              : language === "ar"
              ? "منصة إدارة الأعمال الموحّدة"
              : language === "tr"
              ? "Birleşik iş yönetimi platformu"
              : "The unified business management platform"}
          </div>
        </div>
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
        className="text-2xl xl:text-3xl font-black leading-snug mb-8 max-w-md"
      >
        {fa
          ? "همه‌چیز برای اداره‌ی هوشمند کسب‌وکار شما، در یک‌جا."
          : language === "ar"
          ? "كل ما تحتاجه لإدارة أعمالك بذكاء، في مكان واحد."
          : language === "tr"
          ? "İşletmenizi akıllıca yönetmek için ihtiyacınız olan her şey, tek bir yerde."
          : "Everything to run your business intelligently, in one place."}
      </motion.h2>

      <div className="space-y-3 max-w-md">
        {FEATURES.map((feature, index) => (
          <motion.div
            key={feature.en}
            initial={{ opacity: 0, x: fa ? 20 : -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 + index * 0.1, ease: EASE }}
            className="flex items-center gap-3 rounded-[var(--erp-radius-lg)] border border-[var(--erp-border)] bg-[var(--erp-panel)] backdrop-blur-xl px-4 py-3"
          >
            <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-[var(--erp-glow)] text-[var(--erp-accent)] shrink-0">
              <feature.icon size={19} />
            </span>
            <span className="text-sm font-bold text-[var(--erp-text)]">
              {fa ? feature.fa : language === "ar" ? feature.ar : language === "tr" ? feature.tr : feature.en}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function AnimatedBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <motion.div
        className="absolute w-[36rem] h-[36rem] rounded-full blur-3xl opacity-30"
        style={{ background: "radial-gradient(circle, var(--erp-accent), transparent 70%)", top: "-12rem", insetInlineStart: "-10rem" }}
        animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute w-[30rem] h-[30rem] rounded-full blur-3xl opacity-25"
        style={{ background: "radial-gradient(circle, var(--erp-accent-2), transparent 70%)", bottom: "-10rem", insetInlineEnd: "-8rem" }}
        animate={{ x: [0, -30, 0], y: [0, -20, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute w-[24rem] h-[24rem] rounded-full blur-3xl opacity-20"
        style={{ background: "radial-gradient(circle, var(--erp-accent), transparent 70%)", top: "40%", insetInlineStart: "40%" }}
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: "radial-gradient(var(--erp-text) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(circle at 50% 50%, transparent 0%, var(--erp-bg) 85%)" }}
      />
    </div>
  );
}
