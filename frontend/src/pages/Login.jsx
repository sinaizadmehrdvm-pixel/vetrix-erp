import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../localization/LanguageContext";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { language, dir } = useLanguage();
  const fa = language === "fa";

  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login(form.username.trim(), form.password);
      navigate("/", { replace: true });
    } catch (loginError) {
      setError(
        loginError?.message ||
          (fa ? "نام کاربری یا رمز عبور صحیح نیست." : "Invalid username or password.")
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      dir={dir}
      className="min-h-screen bg-[#071028] flex items-center justify-center text-white px-4"
    >
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md bg-[#0b1736] border border-cyan-500/20 rounded-3xl p-8 shadow-2xl"
      >
        <h1 className="text-4xl font-black text-cyan-400 mb-2">Vetrix ERP</h1>
        <p className="text-gray-400 mb-8">
          {fa ? "سیستم حرفه‌ای حسابداری و مدیریت" : "Professional Accounting System"}
        </p>

        <label className="block text-sm text-gray-300 mb-2" htmlFor="username">
          {fa ? "نام کاربری" : "Username"}
        </label>
        <input
          id="username"
          autoComplete="username"
          value={form.username}
          onChange={(event) => setForm({ ...form, username: event.target.value })}
          placeholder={fa ? "نام کاربری" : "Username"}
          className="w-full mb-4 p-4 rounded-2xl bg-[#132347] outline-none focus:ring-2 focus:ring-cyan-400"
          required
        />

        <label className="block text-sm text-gray-300 mb-2" htmlFor="password">
          {fa ? "رمز عبور" : "Password"}
        </label>
        <input
          id="password"
          autoComplete="current-password"
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
          placeholder={fa ? "رمز عبور" : "Password"}
          type="password"
          className="w-full mb-4 p-4 rounded-2xl bg-[#132347] outline-none focus:ring-2 focus:ring-cyan-400"
          required
        />

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-2xl border border-red-400/30 bg-red-950/40 p-3 text-sm text-red-200"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-cyan-400 text-black font-black py-4 rounded-2xl disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting
            ? fa
              ? "در حال ورود..."
              : "Signing in..."
            : fa
              ? "ورود"
              : "Login"}
        </button>
      </form>
    </div>
  );
}
