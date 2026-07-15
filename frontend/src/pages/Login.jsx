import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, ShieldCheck, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../localization/useLanguage";
import { API_URL } from "../services/api";

export default function Login() {
  const navigate = useNavigate();
  const { login, changePassword } = useAuth();
  const { language, dir } = useLanguage();
  const fa = language === "fa";

  const [mode, setMode] = useState("checking");
  const [form, setForm] = useState({ username: "", password: "" });
  const [passwordChange, setPasswordChange] = useState({ current_password: "", new_password: "", confirm_password: "" });
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
              : "Vetrix service is not reachable. Retry in a few seconds.",
          );
        }
      });
    return () => { active = false; };
  }, [fa]);

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const signedInUser = await login(form.username.trim(), form.password);
      if (signedInUser?.must_change_password) {
        setPasswordChange({ current_password: form.password, new_password: "", confirm_password: "" });
        setMode("force-password-change");
        return;
      }
      navigate("/", { replace: true });
    } catch (loginError) {
      setError(
        loginError?.message ||
          (fa ? "نام کاربری یا رمز عبور صحیح نیست." : "Invalid username or password."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForcedPasswordChange(event) {
    event.preventDefault();
    setError("");
    if (passwordChange.new_password.length < 12) {
      setError(fa ? "رمز عبور جدید باید حداقل ۱۲ نویسه باشد." : "New password must contain at least 12 characters.");
      return;
    }
    if (passwordChange.new_password !== passwordChange.confirm_password) {
      setError(fa ? "تکرار رمز عبور جدید مطابقت ندارد." : "New password confirmation does not match.");
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(passwordChange.current_password, passwordChange.new_password);
      navigate("/", { replace: true });
    } catch (changeError) {
      setError(changeError?.message || (fa ? "تغییر رمز عبور انجام نشد." : "Password change failed."));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetup(event) {
    event.preventDefault();
    setError("");
    if (setup.password.length < 10) {
      setError(fa ? "رمز عبور باید حداقل ۱۰ کاراکتر باشد." : "Password must contain at least 10 characters.");
      return;
    }
    if (setup.password !== setup.confirm_password) {
      setError(fa ? "تکرار رمز عبور مطابقت ندارد." : "Password confirmation does not match.");
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
      setError(setupError?.message || (fa ? "ساخت مدیر انجام نشد." : "Administrator setup failed."));
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full mb-4 p-4 rounded-2xl bg-[#132347] outline-none focus:ring-2 focus:ring-cyan-400";

  return (
    <div dir={dir} className="min-h-screen bg-[#071028] flex items-center justify-center text-white px-4 py-8">
      <section className="w-full max-w-lg bg-[#0b1736] border border-cyan-500/20 rounded-3xl p-8 shadow-2xl">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h1 className="text-4xl font-black text-cyan-400">Vetrix ERP</h1>
          <span className="rounded-full bg-cyan-950 px-3 py-1 text-xs text-cyan-200">v{version}</span>
        </div>
        <p className="text-gray-400 mb-7">
          {mode === "setup"
            ? fa
              ? "راه‌اندازی امن و ساخت مدیر اولیه"
              : "Secure first-run administrator setup"
            : fa
              ? "سیستم حرفه‌ای حسابداری و مدیریت"
              : "Professional Accounting System"}
        </p>

        {mode === "checking" && (
          <div className="py-12 text-center text-cyan-200">
            <ShieldCheck className="mx-auto mb-4 animate-pulse" size={42} />
            {fa ? "در حال بررسی نصب..." : "Checking installation..."}
          </div>
        )}

        {mode === "setup" && (
          <form onSubmit={handleSetup}>
            <div className="mb-5 rounded-2xl border border-emerald-400/25 bg-emerald-950/30 p-4 text-sm text-emerald-100">
              <UserPlus className="mb-2" size={22} />
              {fa
                ? "این اولین اجرای Vetrix است. مدیر اولیه را بسازید؛ این مرحله فقط یک‌بار نمایش داده می‌شود."
                : "This is the first Vetrix run. Create the initial administrator; this step appears only once."}
            </div>
            <label className="block text-sm text-gray-300 mb-2" htmlFor="full-name">
              {fa ? "نام و نام خانوادگی مدیر" : "Administrator full name"}
            </label>
            <input id="full-name" autoComplete="name" value={setup.full_name} onChange={(event) => setSetup({ ...setup, full_name: event.target.value })} className={inputClass} required />

            <label className="block text-sm text-gray-300 mb-2" htmlFor="setup-username">
              {fa ? "نام کاربری مدیر" : "Administrator username"}
            </label>
            <input id="setup-username" autoComplete="username" value={setup.username} onChange={(event) => setSetup({ ...setup, username: event.target.value })} className={inputClass} required />

            <label className="block text-sm text-gray-300 mb-2" htmlFor="setup-password">
              {fa ? "رمز عبور قوی (حداقل ۱۰ کاراکتر)" : "Strong password (minimum 10 characters)"}
            </label>
            <input id="setup-password" autoComplete="new-password" type="password" value={setup.password} onChange={(event) => setSetup({ ...setup, password: event.target.value })} className={inputClass} minLength={10} required />

            <label className="block text-sm text-gray-300 mb-2" htmlFor="confirm-password">
              {fa ? "تکرار رمز عبور" : "Confirm password"}
            </label>
            <input id="confirm-password" autoComplete="new-password" type="password" value={setup.confirm_password} onChange={(event) => setSetup({ ...setup, confirm_password: event.target.value })} className={inputClass} minLength={10} required />

            {error && <ErrorBox message={error} />}
            <button type="submit" disabled={submitting} className="w-full bg-emerald-400 text-black font-black py-4 rounded-2xl disabled:opacity-60 flex items-center justify-center gap-2">
              <CheckCircle2 size={19} />
              {submitting ? (fa ? "در حال راه‌اندازی..." : "Setting up...") : (fa ? "ساخت مدیر و ورود" : "Create administrator & sign in")}
            </button>
          </form>
        )}



        {mode === "force-password-change" && (
          <form onSubmit={handleForcedPasswordChange}>
            <div className="mb-5 rounded-2xl border border-amber-400/25 bg-amber-950/30 p-4 text-sm text-amber-100">
              <KeyRound className="mb-2" size={22} />
              {fa
                ? "برای ادامه، بنا به سیاست امنیتی مدیر باید رمز عبور خود را تغییر دهید."
                : "To continue, your administrator requires you to change your password."}
            </div>
            <label className="block text-sm text-gray-300 mb-2" htmlFor="new-password">
              {fa ? "رمز عبور جدید" : "New password"}
            </label>
            <input id="new-password" autoComplete="new-password" type="password" value={passwordChange.new_password} onChange={(event) => setPasswordChange({ ...passwordChange, new_password: event.target.value })} className={inputClass} minLength={12} required />

            <label className="block text-sm text-gray-300 mb-2" htmlFor="confirm-new-password">
              {fa ? "تکرار رمز عبور جدید" : "Confirm new password"}
            </label>
            <input id="confirm-new-password" autoComplete="new-password" type="password" value={passwordChange.confirm_password} onChange={(event) => setPasswordChange({ ...passwordChange, confirm_password: event.target.value })} className={inputClass} minLength={12} required />

            {error && <ErrorBox message={error} />}
            <button type="submit" disabled={submitting} className="w-full bg-amber-300 text-black font-black py-4 rounded-2xl disabled:opacity-60">
              {submitting ? (fa ? "در حال تغییر رمز..." : "Changing password...") : (fa ? "تغییر رمز و ادامه" : "Change password & continue")}
            </button>
          </form>
        )}

        {mode === "login" && (
          <form onSubmit={handleLogin}>
            <KeyRound className="mb-4 text-cyan-300" size={28} />
            <label className="block text-sm text-gray-300 mb-2" htmlFor="username">
              {fa ? "نام کاربری" : "Username"}
            </label>
            <input id="username" autoComplete="username" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} className={inputClass} required />

            <label className="block text-sm text-gray-300 mb-2" htmlFor="password">
              {fa ? "رمز عبور" : "Password"}
            </label>
            <input id="password" autoComplete="current-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} type="password" className={inputClass} required />

            {error && <ErrorBox message={error} />}
            <button type="submit" disabled={submitting} className="w-full bg-cyan-400 text-black font-black py-4 rounded-2xl disabled:opacity-60">
              {submitting ? (fa ? "در حال ورود..." : "Signing in...") : (fa ? "ورود" : "Login")}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function ErrorBox({ message }) {
  return (
    <div role="alert" className="mb-4 rounded-2xl border border-red-400/30 bg-red-950/40 p-3 text-sm text-red-200">
      {message}
    </div>
  );
}
