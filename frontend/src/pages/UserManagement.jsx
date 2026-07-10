import { useEffect, useState } from "react";
import {
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  Shield,
  ShieldAlert,
  UserCog,
  UsersRound,
} from "lucide-react";
import toast from "react-hot-toast";

import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../localization/LanguageContext";
import { createUser, getRoles, getUsers, updateUserRole } from "../services/usersApi";

const emptyForm = {
  full_name: "",
  username: "",
  password: "",
  role: "viewer",
};

export default function UserManagement() {
  const { user } = useAuth();
  const { language, dir, n } = useLanguage();
  const fa = language === "fa";
  const isAdmin = user?.role === "admin";
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const copy = {
    title: fa ? "کاربران و سطح دسترسی" : "Users & Access Control",
    subtitle: fa
      ? "مدیریت کاربران بر اساس اصل حداقل دسترسی"
      : "Manage users according to the principle of least privilege",
    denied: fa ? "این بخش فقط برای مدیر سیستم قابل دسترسی است." : "This area is restricted to administrators.",
    create: fa ? "ایجاد کاربر جدید" : "Create a new user",
    fullName: fa ? "نام کامل" : "Full name",
    username: fa ? "نام کاربری" : "Username",
    password: fa ? "رمز عبور" : "Password",
    role: fa ? "نقش" : "Role",
    add: fa ? "ساخت حساب" : "Create account",
    users: fa ? "کاربران سیستم" : "System users",
    save: fa ? "ذخیره نقش" : "Save role",
    current: fa ? "حساب فعلی" : "Current account",
    capabilities: fa ? "دسترسی‌ها" : "Capabilities",
    noUsers: fa ? "کاربری یافت نشد." : "No users found.",
    passwordHint: fa ? "حداقل ۱۲ نویسه پیشنهاد می‌شود" : "At least 12 characters is recommended",
  };

  const roleNames = {
    admin: fa ? "مدیر سیستم" : "Administrator",
    accountant: fa ? "حسابدار" : "Accountant",
    sales: fa ? "فروش" : "Sales",
    warehouse: fa ? "انباردار" : "Warehouse",
    viewer: fa ? "مشاهده‌گر" : "Read only",
  };
  const capabilityNames = {
    "*": fa ? "دسترسی کامل" : "Full access",
    "customers.write": fa ? "مدیریت طرف‌حساب" : "Manage parties",
    "invoices.write": fa ? "مدیریت فاکتور" : "Manage invoices",
    "transactions.write": fa ? "دریافت و پرداخت" : "Payments & receipts",
    "expenses.write": fa ? "مدیریت هزینه" : "Manage expenses",
    "accounting.write": fa ? "ثبت اسناد حسابداری" : "Post accounting entries",
    "products.write": fa ? "مدیریت کالا" : "Manage products",
    "inventory.write": fa ? "مدیریت انبار" : "Manage inventory",
    "reports.read": fa ? "مشاهده گزارش" : "View reports",
    read: fa ? "فقط مشاهده" : "Read only",
  };

  async function load() {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [userData, roleData] = await Promise.all([getUsers(), getRoles()]);
      setUsers(Array.isArray(userData) ? userData : []);
      setRoles(Array.isArray(roleData) ? roleData : []);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [language, isAdmin]);

  async function submit(event) {
    event.preventDefault();
    if (!form.full_name.trim() || !form.username.trim() || !form.password) {
      toast.error(fa ? "همه فیلدها الزامی هستند." : "All fields are required.");
      return;
    }
    if (form.password.length < 12) {
      toast.error(fa ? "رمز عبور باید حداقل ۱۲ نویسه باشد." : "Password must be at least 12 characters.");
      return;
    }
    setCreating(true);
    try {
      await createUser({
        ...form,
        full_name: form.full_name.trim(),
        username: form.username.trim(),
      });
      toast.success(fa ? "کاربر ایجاد شد." : "User created.");
      setForm(emptyForm);
      await load();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setCreating(false);
    }
  }

  async function saveRole(target) {
    const selected = document.getElementById(`role-${target.id}`)?.value;
    if (!selected || selected === target.role) return;
    setBusyId(target.id);
    try {
      await updateUserRole(target.id, selected);
      toast.success(fa ? "نقش کاربر به‌روزرسانی شد." : "User role updated.");
      await load();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setBusyId(null);
    }
  }

  const card = {
    background: "linear-gradient(145deg,rgba(15,23,42,.95),rgba(15,23,42,.72))",
    border: "1px solid rgba(34,211,238,.2)",
    borderRadius: 24,
    boxShadow: "0 18px 55px rgba(2,6,23,.3)",
  };
  const input = {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 13px",
    borderRadius: 13,
    border: "1px solid rgba(148,163,184,.25)",
    background: "#111c35",
    color: "#f8fafc",
  };

  if (!isAdmin) {
    return (
      <div dir={dir} style={{ ...card, maxWidth: 760, margin: "80px auto", padding: 36, textAlign: "center", color: "#fecaca" }}>
        <ShieldAlert size={48} style={{ margin: "0 auto 16px" }} />
        <h1>{copy.denied}</h1>
      </div>
    );
  }

  return (
    <div dir={dir} style={{ color: "#f8fafc", maxWidth: 1500, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 15, flexWrap: "wrap", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 54, height: 54, display: "grid", placeItems: "center", borderRadius: 17, background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
            <UsersRound size={29} />
          </div>
          <div>
            <h1 style={{ margin: 0, color: "#a5f3fc", fontSize: "clamp(28px,4vw,41px)" }}>{copy.title}</h1>
            <p style={{ margin: "7px 0 0", color: "#94a3b8" }}>{copy.subtitle}</p>
          </div>
        </div>
        <button onClick={load} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 8, border: 0, borderRadius: 13, padding: "11px 15px", background: "#164e63", color: "#cffafe", fontWeight: 900, cursor: "pointer" }}>
          <RefreshCw size={17} /> {loading ? "..." : fa ? "به‌روزرسانی" : "Refresh"}
        </button>
      </header>

      {error && <div style={{ ...card, padding: 15, marginBottom: 18, color: "#fecaca" }}>{error}</div>}

      <form onSubmit={submit} style={{ ...card, padding: 20, marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 16px", color: "#c4b5fd", display: "flex", gap: 8, alignItems: "center" }}><Plus size={21} />{copy.create}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 11 }}>
          <input style={input} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder={copy.fullName} />
          <input style={input} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder={copy.username} autoComplete="off" />
          <label style={{ position: "relative" }}>
            <KeyRound size={16} style={{ position: "absolute", top: 14, insetInlineStart: 12, color: "#64748b" }} />
            <input type="password" style={{ ...input, paddingInlineStart: 38 }} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={copy.password} autoComplete="new-password" />
            <small style={{ color: "#64748b" }}>{copy.passwordHint}</small>
          </label>
          <select style={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {roles.map((role) => <option key={role.code} value={role.code}>{roleNames[role.code] || role.label}</option>)}
          </select>
          <button disabled={creating} type="submit" style={{ border: 0, borderRadius: 13, minHeight: 45, padding: "11px 16px", background: "linear-gradient(135deg,#22d3ee,#22c55e)", color: "#03111f", fontWeight: 950, cursor: "pointer" }}>
            {creating ? "..." : copy.add}
          </button>
        </div>
      </form>

      <section style={{ ...card, padding: 20 }}>
        <h2 style={{ margin: "0 0 16px", color: "#67e8f9", display: "flex", alignItems: "center", gap: 9 }}><UserCog />{copy.users} ({n(users.length)})</h2>
        <div style={{ display: "grid", gap: 12 }}>
          {!loading && users.length === 0 && <div style={{ color: "#94a3b8", textAlign: "center", padding: 28 }}>{copy.noUsers}</div>}
          {users.map((target) => {
            const role = roles.find((item) => item.code === target.role);
            const self = target.id === user.id;
            return (
              <article key={target.id} style={{ borderRadius: 18, padding: 16, background: "rgba(30,41,59,.72)", border: self ? "1px solid rgba(34,211,238,.4)" : "1px solid rgba(148,163,184,.1)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(180px,1fr) minmax(150px,.6fr) minmax(250px,1.5fr) auto", alignItems: "center", gap: 12 }}>
                  <div>
                    <strong style={{ fontSize: 17 }}>{target.full_name}</strong>
                    <div style={{ color: "#94a3b8", marginTop: 4, direction: "ltr", textAlign: dir === "rtl" ? "right" : "left" }}>@{target.username}</div>
                    {self && <span style={{ display: "inline-block", marginTop: 6, color: "#67e8f9", fontSize: 12 }}>{copy.current}</span>}
                  </div>
                  <select id={`role-${target.id}`} defaultValue={target.role === "user" ? "viewer" : target.role} disabled={self} style={input}>
                    {roles.map((item) => <option key={item.code} value={item.code}>{roleNames[item.code] || item.label}</option>)}
                  </select>
                  <div>
                    <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 7 }}>{copy.capabilities}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {(role?.capabilities || ["read"]).map((capability) => (
                        <span key={capability} style={{ borderRadius: 999, padding: "5px 9px", color: "#cbd5e1", background: "rgba(15,23,42,.8)", fontSize: 11 }}>
                          {capabilityNames[capability] || capability}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => saveRole(target)} disabled={self || busyId === target.id} style={{ display: "flex", alignItems: "center", gap: 7, border: 0, borderRadius: 12, padding: "10px 13px", background: self ? "#334155" : "#155e75", color: self ? "#64748b" : "#cffafe", fontWeight: 900, cursor: self ? "not-allowed" : "pointer" }}>
                    <Save size={16} />{busyId === target.id ? "..." : copy.save}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div style={{ ...card, padding: 16, marginTop: 18, display: "flex", gap: 10, alignItems: "center", color: "#bbf7d0", borderColor: "rgba(34,197,94,.3)" }}>
        <Shield />
        {fa ? "تمام تغییرات نقش در مرکز حسابرسی ثبت می‌شوند." : "Every role change is recorded in the audit center."}
      </div>
    </div>
  );
}
