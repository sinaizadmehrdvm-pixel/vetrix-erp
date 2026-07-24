import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, ShieldOff, ShieldPlus } from "lucide-react";
import toast from "react-hot-toast";

import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../localization/useLanguage";
import { disableTotp, getTotpStatus, setupTotp, verifyTotp } from "../services/mfaApi";

const card = "rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-panel)] p-6";
const input = "w-full mb-4 p-3 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] outline-none focus:ring-2 focus:ring-cyan-400";
const primaryButton = "rounded-xl bg-cyan-400 text-black font-black px-5 py-3 disabled:opacity-60";

export default function AccountSecurity() {
  const { changePassword } = useAuth();
  const { dir, language } = useLanguage();
  const fa = language === "fa";

  const [loadingStatus, setLoadingStatus] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const [setupState, setSetupState] = useState(null); // { secret, provisioning_uri, qr_code }
  const [verifyCode, setVerifyCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState(null);

  const [disableForm, setDisableForm] = useState({ password: "", code: "" });

  const [passwordForm, setPasswordForm] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getTotpStatus()
      .then((data) => { if (active) setEnabled(Boolean(data?.enabled)); })
      .catch(() => {})
      .finally(() => { if (active) setLoadingStatus(false); });
    return () => { active = false; };
  }, []);

  async function handleStartSetup() {
    setBusy(true);
    try {
      const data = await setupTotp();
      setSetupState(data);
      setVerifyCode("");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await verifyTotp(verifyCode.trim());
      setRecoveryCodes(data.recovery_codes);
      setSetupState(null);
      setEnabled(true);
      toast.success(fa ? "احراز هویت دومرحله‌ای فعال شد." : "Two-factor authentication is enabled.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await disableTotp(disableForm.password, disableForm.code.trim());
      setEnabled(false);
      setDisableForm({ password: "", code: "" });
      toast.success(fa ? "احراز هویت دومرحله‌ای غیرفعال شد." : "Two-factor authentication is disabled.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordChange(event) {
    event.preventDefault();
    if (passwordForm.new_password.length < 12) {
      toast.error(fa ? "رمز عبور جدید باید حداقل ۱۲ نویسه باشد." : "New password must be at least 12 characters.");
      return;
    }
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error(fa ? "تکرار رمز عبور مطابقت ندارد." : "Password confirmation does not match.");
      return;
    }
    setPasswordBusy(true);
    try {
      await changePassword(passwordForm.current_password, passwordForm.new_password);
      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
      toast.success(fa ? "رمز عبور تغییر کرد." : "Password changed.");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <div dir={dir} className="p-4 md:p-6 space-y-6 text-[var(--erp-text)]">
      <h1 className="text-2xl font-black flex items-center gap-2">
        <ShieldCheck className="text-[var(--erp-accent)]" />
        {fa ? "امنیت حساب کاربری" : "Account security"}
      </h1>

      <section className={card}>
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <KeyRound size={18} />
          {fa ? "تغییر رمز عبور" : "Change password"}
        </h2>
        <form onSubmit={handlePasswordChange}>
          <input
            type="password"
            autoComplete="current-password"
            placeholder={fa ? "رمز عبور فعلی" : "Current password"}
            value={passwordForm.current_password}
            onChange={(event) => setPasswordForm({ ...passwordForm, current_password: event.target.value })}
            className={input}
            required
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder={fa ? "رمز عبور جدید" : "New password"}
            value={passwordForm.new_password}
            onChange={(event) => setPasswordForm({ ...passwordForm, new_password: event.target.value })}
            className={input}
            minLength={12}
            required
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder={fa ? "تکرار رمز عبور جدید" : "Confirm new password"}
            value={passwordForm.confirm_password}
            onChange={(event) => setPasswordForm({ ...passwordForm, confirm_password: event.target.value })}
            className={input}
            minLength={12}
            required
          />
          <button type="submit" disabled={passwordBusy} className={primaryButton}>
            {passwordBusy ? (fa ? "در حال تغییر..." : "Changing...") : (fa ? "تغییر رمز عبور" : "Change password")}
          </button>
        </form>
      </section>

      <section className={card}>
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <ShieldPlus size={18} />
          {fa ? "احراز هویت دومرحله‌ای (TOTP)" : "Two-factor authentication (TOTP)"}
        </h2>

        {loadingStatus ? (
          <p className="text-[var(--erp-muted)]">{fa ? "در حال بارگذاری..." : "Loading..."}</p>
        ) : recoveryCodes ? (
          <div>
            <p className="mb-3 text-emerald-300 font-bold">
              {fa
                ? "این کدهای بازیابی را همین حالا در جایی امن ذخیره کنید. هرکدام فقط یک‌بار قابل استفاده است."
                : "Save these recovery codes somewhere safe now. Each one can be used only once."}
            </p>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm mb-4">
              {recoveryCodes.map((code) => (
                <div key={code} className="rounded-lg bg-[var(--erp-panel-solid)] px-3 py-2 text-center">{code}</div>
              ))}
            </div>
            <button className={primaryButton} onClick={() => setRecoveryCodes(null)}>
              {fa ? "ذخیره کردم" : "I've saved these"}
            </button>
          </div>
        ) : enabled ? (
          <div>
            <p className="mb-4 text-emerald-300">{fa ? "احراز هویت دومرحله‌ای فعال است." : "Two-factor authentication is enabled."}</p>
            <form onSubmit={handleDisable}>
              <input
                type="password"
                autoComplete="current-password"
                placeholder={fa ? "رمز عبور فعلی" : "Current password"}
                value={disableForm.password}
                onChange={(event) => setDisableForm({ ...disableForm, password: event.target.value })}
                className={input}
                required
              />
              <input
                inputMode="numeric"
                placeholder={fa ? "کد تأیید یا کد بازیابی" : "Authenticator or recovery code"}
                value={disableForm.code}
                onChange={(event) => setDisableForm({ ...disableForm, code: event.target.value })}
                className={input}
                required
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-red-500/90 text-white font-black px-5 py-3 disabled:opacity-60 flex items-center gap-2"
              >
                <ShieldOff size={16} />
                {busy ? (fa ? "در حال غیرفعال‌سازی..." : "Disabling...") : (fa ? "غیرفعال کردن" : "Disable 2FA")}
              </button>
            </form>
          </div>
        ) : setupState ? (
          <div>
            <p className="mb-3 text-[var(--erp-muted)]">
              {fa
                ? "کد QR را با Google Authenticator یا برنامه مشابه اسکن کنید، سپس کد شش‌رقمی را وارد کنید."
                : "Scan the QR code with Google Authenticator (or similar), then enter the 6-digit code."}
            </p>
            <img src={setupState.qr_code} alt="TOTP QR code" className="mb-3 rounded-xl bg-white p-2 w-48 h-48" />
            <p className="mb-4 font-mono text-sm text-[var(--erp-muted)] break-all">{setupState.secret}</p>
            <form onSubmit={handleVerify}>
              <input
                inputMode="numeric"
                placeholder={fa ? "کد شش‌رقمی" : "6-digit code"}
                value={verifyCode}
                onChange={(event) => setVerifyCode(event.target.value)}
                className={input}
                required
                autoFocus
              />
              <button type="submit" disabled={busy} className={primaryButton}>
                {busy ? (fa ? "در حال تأیید..." : "Verifying...") : (fa ? "تأیید و فعال‌سازی" : "Verify & enable")}
              </button>
            </form>
          </div>
        ) : (
          <div>
            <p className="mb-4 text-[var(--erp-muted)]">
              {fa
                ? "احراز هویت دومرحله‌ای فعال نیست. با فعال‌سازی، ورود به حساب علاوه بر رمز عبور به یک کد یک‌بارمصرف نیز نیاز خواهد داشت."
                : "Two-factor authentication is off. Enabling it requires a one-time code in addition to your password at every login."}
            </p>
            <button onClick={handleStartSetup} disabled={busy} className={primaryButton}>
              {busy ? (fa ? "در حال آماده‌سازی..." : "Preparing...") : (fa ? "فعال‌سازی احراز هویت دومرحله‌ای" : "Enable two-factor authentication")}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
