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
import Select from "../components/ui/Select";
import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, toEnglishDigits } from "../localization/helpers";
import {
  createUser, getRoles, getUsers, resetUserPassword, updateUserRole,
  updateUserCompany, updateUserSuperAdmin,
  getCustomRoles, createCustomRole, deleteCustomRole,
} from "../services/usersApi";
import { getCompanies } from "../services/companiesApi";

const emptyForm = {
  full_name: "",
  username: "",
  password: "",
  role: "viewer",
  company_id: "",
  is_super_admin: false,
};

export default function UserManagement() {
  const { user, applyRefreshedToken } = useAuth();
  const { language, dir, n } = useLanguage();
  const fa = language === "fa";
  const isAdmin = user?.role === "admin";
  const isSuperAdmin = !!user?.is_super_admin;
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [moveTargets, setMoveTargets] = useState({});
  const [roleSelections, setRoleSelections] = useState({});
  const [customRoles, setCustomRoles] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [customRoleForm, setCustomRoleForm] = useState({ code: "", label: "", base_role: "sales", restrict_customers_to_own: false });
  const [creatingCustomRole, setCreatingCustomRole] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [resetForms, setResetForms] = useState({});
  const [error, setError] = useState("");

  const copy = {
    title: fa ? "کاربران و سطح دسترسی" : language === "ar" ? "المستخدمون والصلاحيات" : language === "tr" ? "Kullanıcılar ve Yetkiler" : "Users & Access Control",
    subtitle: fa
      ? "مدیریت کاربران بر اساس اصل حداقل دسترسی"
      : language === "ar"
      ? "إدارة المستخدمين وفق مبدأ الحد الأدنى من الصلاحيات"
      : language === "tr"
      ? "Kullanıcıları en az yetki ilkesine göre yönetin"
      : "Manage users according to the principle of least privilege",
    denied: fa ? "این بخش فقط برای مدیر سیستم قابل دسترسی است." : language === "ar" ? "هذا القسم مقتصر على المسؤولين." : language === "tr" ? "Bu alan yalnızca yöneticilere açıktır." : "This area is restricted to administrators.",
    create: fa ? "ایجاد کاربر جدید" : language === "ar" ? "إنشاء مستخدم جديد" : language === "tr" ? "Yeni kullanıcı oluştur" : "Create a new user",
    fullName: fa ? "نام کامل" : language === "ar" ? "الاسم الكامل" : language === "tr" ? "Ad Soyad" : "Full name",
    username: fa ? "نام کاربری" : language === "ar" ? "اسم المستخدم" : language === "tr" ? "Kullanıcı adı" : "Username",
    password: fa ? "رمز عبور" : language === "ar" ? "كلمة المرور" : language === "tr" ? "Şifre" : "Password",
    role: fa ? "نقش" : language === "ar" ? "الدور" : language === "tr" ? "Rol" : "Role",
    add: fa ? "ساخت حساب" : language === "ar" ? "إنشاء الحساب" : language === "tr" ? "Hesap oluştur" : "Create account",
    users: fa ? "کاربران سیستم" : language === "ar" ? "مستخدمو النظام" : language === "tr" ? "Sistem kullanıcıları" : "System users",
    save: fa ? "ذخیره نقش" : language === "ar" ? "حفظ الدور" : language === "tr" ? "Rolü kaydet" : "Save role",
    current: fa ? "حساب فعلی" : language === "ar" ? "الحساب الحالي" : language === "tr" ? "Mevcut hesap" : "Current account",
    capabilities: fa ? "دسترسی‌ها" : language === "ar" ? "الصلاحيات" : language === "tr" ? "Yetkiler" : "Capabilities",
    noUsers: fa ? "کاربری یافت نشد." : language === "ar" ? "لم يتم العثور على مستخدمين." : language === "tr" ? "Kullanıcı bulunamadı." : "No users found.",
    passwordHint: fa ? "حداقل ۱۲ نویسه پیشنهاد می‌شود" : language === "ar" ? "يُنصح بحد أدنى 12 حرفًا" : language === "tr" ? "En az 12 karakter önerilir" : "At least 12 characters is recommended",
    resetPassword: fa ? "بازیابی امن رمز" : language === "ar" ? "استعادة آمنة لكلمة المرور" : language === "tr" ? "Güvenli şifre kurtarma" : "Secure password recovery",
    temporaryPassword: fa ? "رمز موقت امن" : language === "ar" ? "كلمة مرور مؤقتة آمنة" : language === "tr" ? "Güvenli geçici şifre" : "Secure temporary password",
    forceNextLogin: fa ? "اجبار تغییر در ورود بعدی" : language === "ar" ? "إجبار التغيير عند تسجيل الدخول التالي" : language === "tr" ? "Bir sonraki girişte değişikliği zorunlu kıl" : "Force change on next login",
    resetPrompt: fa ? "رمز موقت فقط برای بازیابی اضطراری است و نباید از کانال ناامن ارسال شود." : language === "ar" ? "كلمات المرور المؤقتة مخصصة للاستعادة الطارئة فقط ويجب عدم مشاركتها عبر قنوات غير آمنة." : language === "tr" ? "Geçici şifreler yalnızca acil durum kurtarma içindir ve güvensiz kanallar üzerinden paylaşılmamalıdır." : "Temporary passwords are for emergency recovery only and must not be shared over insecure channels.",
    forced: fa ? "تغییر رمز اجباری" : language === "ar" ? "يلزم تغيير كلمة المرور" : language === "tr" ? "Şifre değişikliği gerekli" : "Password change required",
    company: fa ? "شرکت" : language === "ar" ? "الشركة" : language === "tr" ? "Şirket" : "Company",
    superAdmin: fa ? "سوپرادمین" : language === "ar" ? "مسؤول عام" : language === "tr" ? "Süper yönetici" : "Super-admin",
    moveCompany: fa ? "انتقال به شرکت" : language === "ar" ? "نقل إلى شركة" : language === "tr" ? "Şirkete taşı" : "Move to company",
    move: fa ? "انتقال" : language === "ar" ? "نقل" : language === "tr" ? "Taşı" : "Move",
    grantSuperAdmin: fa ? "اعطای سوپرادمین" : language === "ar" ? "منح صلاحية المسؤول العام" : language === "tr" ? "Süper yönetici yap" : "Grant super-admin",
    revokeSuperAdmin: fa ? "لغو سوپرادمین" : language === "ar" ? "سحب صلاحية المسؤول العام" : language === "tr" ? "Süper yöneticiliği kaldır" : "Revoke super-admin",
  };

  const roleNames = {
    admin: fa ? "مدیر سیستم" : language === "ar" ? "مسؤول النظام" : language === "tr" ? "Yönetici" : "Administrator",
    accountant: fa ? "حسابدار" : language === "ar" ? "محاسب" : language === "tr" ? "Muhasebeci" : "Accountant",
    sales: fa ? "فروش" : language === "ar" ? "المبيعات" : language === "tr" ? "Satış" : "Sales",
    warehouse: fa ? "انباردار" : language === "ar" ? "أمين المستودع" : language === "tr" ? "Depo Sorumlusu" : "Warehouse",
    viewer: fa ? "مشاهده‌گر" : language === "ar" ? "مشاهدة فقط" : language === "tr" ? "Salt okunur" : "Read only",
  };
  const capabilityNames = {
    "*": fa ? "دسترسی کامل" : language === "ar" ? "وصول كامل" : language === "tr" ? "Tam erişim" : "Full access",
    "customers.write": fa ? "مدیریت طرف‌حساب" : language === "ar" ? "إدارة الأطراف" : language === "tr" ? "Carileri yönet" : "Manage parties",
    "invoices.write": fa ? "مدیریت فاکتور" : language === "ar" ? "إدارة الفواتير" : language === "tr" ? "Faturaları yönet" : "Manage invoices",
    "transactions.write": fa ? "دریافت و پرداخت" : language === "ar" ? "المدفوعات والمقبوضات" : language === "tr" ? "Tahsilat ve Ödemeler" : "Payments & receipts",
    "expenses.write": fa ? "مدیریت هزینه" : language === "ar" ? "إدارة المصروفات" : language === "tr" ? "Giderleri yönet" : "Manage expenses",
    "accounting.write": fa ? "ثبت اسناد حسابداری" : language === "ar" ? "ترحيل القيود المحاسبية" : language === "tr" ? "Muhasebe fişlerini kesinleştir" : "Post accounting entries",
    "products.write": fa ? "مدیریت کالا" : language === "ar" ? "إدارة المنتجات" : language === "tr" ? "Ürünleri yönet" : "Manage products",
    "inventory.write": fa ? "مدیریت انبار" : language === "ar" ? "إدارة المخزون" : language === "tr" ? "Stoku yönet" : "Manage inventory",
    "reports.read": fa ? "مشاهده گزارش" : language === "ar" ? "عرض التقارير" : language === "tr" ? "Raporları görüntüle" : "View reports",
    read: fa ? "فقط مشاهده" : language === "ar" ? "قراءة فقط" : language === "tr" ? "Salt okunur" : "Read only",
  };

  async function load() {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [userData, roleData, customRoleData, companyData] = await Promise.all([
        getUsers(),
        getRoles(),
        getCustomRoles().catch(() => []),
        isSuperAdmin ? getCompanies().catch(() => []) : Promise.resolve([]),
      ]);
      const customRoleList = Array.isArray(customRoleData) ? customRoleData : [];
      setUsers(Array.isArray(userData) ? userData : []);
      setCustomRoles(customRoleList);
      setCompanies(Array.isArray(companyData) ? companyData : []);
      const builtIn = Array.isArray(roleData) ? roleData : [];
      const customAsRoles = customRoleList.map((cr) => ({
        code: cr.code,
        label: cr.label,
        capabilities: (builtIn.find((r) => r.code === cr.base_role) || {}).capabilities || [],
      }));
      setRoles([...builtIn, ...customAsRoles]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // The page intentionally reloads admin/user metadata when language or admin status changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, isAdmin, isSuperAdmin]);

  async function submit(event) {
    event.preventDefault();
    if (!form.full_name.trim() || !form.username.trim() || !form.password) {
      toast.error(fa ? "همه فیلدها الزامی هستند." : language === "ar" ? "جميع الحقول مطلوبة." : language === "tr" ? "Tüm alanlar zorunludur." : "All fields are required.");
      return;
    }
    if (form.password.length < 12) {
      toast.error(fa ? "رمز عبور باید حداقل ۱۲ نویسه باشد." : language === "ar" ? "يجب أن تتكون كلمة المرور من 12 حرفًا على الأقل." : language === "tr" ? "Şifre en az 12 karakter olmalıdır." : "Password must be at least 12 characters.");
      return;
    }
    setCreating(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        username: form.username.trim(),
        password: form.password,
        role: form.role,
      };
      if (isSuperAdmin) {
        payload.is_super_admin = form.is_super_admin;
        if (form.company_id) payload.company_id = Number(form.company_id);
      }
      await createUser(payload);
      toast.success(fa ? "کاربر ایجاد شد." : language === "ar" ? "تم إنشاء المستخدم." : language === "tr" ? "Kullanıcı oluşturuldu." : "User created.");
      setForm(emptyForm);
      await load();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setCreating(false);
    }
  }

  async function submitCustomRole(event) {
    event.preventDefault();
    if (!customRoleForm.code.trim() || !customRoleForm.label.trim()) {
      toast.error(fa ? "کد و عنوان نقش الزامی است." : language === "ar" ? "رمز الدور وعنوانه مطلوبان." : language === "tr" ? "Rol kodu ve etiketi gereklidir." : "Role code and label are required.");
      return;
    }
    setCreatingCustomRole(true);
    try {
      const result = await createCustomRole(customRoleForm);
      if (result?.status === "error") throw new Error(result.message);
      toast.success(fa ? "نقش سفارشی ایجاد شد." : language === "ar" ? "تم إنشاء الدور المخصص." : language === "tr" ? "Özel rol oluşturuldu." : "Custom role created.");
      setCustomRoleForm({ code: "", label: "", base_role: "sales", restrict_customers_to_own: false });
      await load();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setCreatingCustomRole(false);
    }
  }

  async function removeCustomRole(id) {
    try {
      await deleteCustomRole(id);
      toast.success(fa ? "نقش سفارشی حذف شد." : language === "ar" ? "تم حذف الدور المخصص." : language === "tr" ? "Özel rol silindi." : "Custom role deleted.");
      await load();
    } catch (requestError) {
      toast.error(requestError.message);
    }
  }

  function updateResetForm(userId, patch) {
    setResetForms((current) => ({
      ...current,
      [userId]: { password: "", force: true, ...(current[userId] || {}), ...patch },
    }));
  }

  async function resetPassword(target) {
    const resetForm = resetForms[target.id] || { password: "", force: true };
    const password = resetForm.password;
    if (!password) {
      toast.error(fa ? "رمز موقت را وارد کنید." : language === "ar" ? "أدخل كلمة مرور مؤقتة." : language === "tr" ? "Geçici bir şifre girin." : "Enter a temporary password.");
      return;
    }
    if (password.length < 12) {
      toast.error(fa ? "رمز عبور باید حداقل ۱۲ نویسه باشد." : language === "ar" ? "يجب أن تتكون كلمة المرور من 12 حرفًا على الأقل." : language === "tr" ? "Şifre en az 12 karakter olmalıdır." : "Password must be at least 12 characters.");
      return;
    }
    setBusyId(target.id);
    try {
      const result = await resetUserPassword(target.id, { password, force_change_on_next_login: resetForm.force !== false });
      if (result?.self_reset && result?.access_token) {
        // Resetting your own password revokes the token used to do it; adopt
        // the fresh one so this session isn't unexpectedly logged out.
        applyRefreshedToken(result.access_token);
      }
      toast.success(resetForm.force !== false
        ? fa
          ? "رمز عبور بازیابی شد و تغییر در ورود بعدی اجباری است."
          : language === "ar"
          ? "تمت استعادة كلمة المرور، ويلزم تغييرها عند تسجيل الدخول التالي."
          : language === "tr"
          ? "Şifre kurtarıldı ve bir sonraki girişte değiştirilmesi zorunlu."
          : "Password recovered and next-login change is required."
        : fa
          ? "رمز عبور بازیابی شد."
          : language === "ar"
          ? "تمت استعادة كلمة المرور."
          : language === "tr"
          ? "Şifre kurtarıldı."
          : "Password recovered.");
      setResetForms((current) => ({ ...current, [target.id]: { password: "", force: true } }));
      await load();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setBusyId(null);
    }
  }

  async function saveRole(target) {
    const selected = roleSelections[target.id] ?? (target.role === "user" ? "viewer" : target.role);
    if (!selected || selected === target.role) return;
    setBusyId(target.id);
    try {
      await updateUserRole(target.id, selected);
      toast.success(fa ? "نقش کاربر به‌روزرسانی شد." : language === "ar" ? "تم تحديث دور المستخدم." : language === "tr" ? "Kullanıcı rolü güncellendi." : "User role updated.");
      await load();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setBusyId(null);
    }
  }

  async function moveUserCompany(target) {
    const companyId = Number(moveTargets[target.id]);
    if (!companyId || companyId === target.company_id) return;
    setBusyId(target.id);
    try {
      await updateUserCompany(target.id, companyId);
      toast.success(fa ? "کاربر منتقل شد." : language === "ar" ? "تم نقل المستخدم." : language === "tr" ? "Kullanıcı taşındı." : "User moved.");
      await load();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleSuperAdmin(target) {
    setBusyId(target.id);
    try {
      await updateUserSuperAdmin(target.id, !target.is_super_admin);
      toast.success(fa ? "وضعیت سوپرادمین به‌روزرسانی شد." : language === "ar" ? "تم تحديث حالة المسؤول العام." : language === "tr" ? "Süper yönetici durumu güncellendi." : "Super-admin status updated.");
      await load();
    } catch (requestError) {
      toast.error(requestError.message);
    } finally {
      setBusyId(null);
    }
  }

  const card = {
    background: "var(--erp-panel)",
    border: "1px solid var(--erp-border)",
    borderRadius: 24,
    boxShadow: "0 18px 55px rgba(2,6,23,.3)",
  };
  const input = {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 13px",
    borderRadius: 13,
    border: "1px solid var(--erp-border)",
    background: "var(--erp-panel-solid)",
    color: "var(--erp-text)",
  };

  if (!isAdmin) {
    return (
      <div dir={dir} className="text-red-200" style={{ ...card, maxWidth: 760, margin: "80px auto", padding: 36, textAlign: "center" }}>
        <ShieldAlert size={48} style={{ margin: "0 auto 16px" }} />
        <h1>{copy.denied}</h1>
      </div>
    );
  }

  return (
    <div dir={dir} style={{ color: "var(--erp-text)", maxWidth: 1500, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 15, flexWrap: "wrap", marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          <div style={{ width: 54, height: 54, display: "grid", placeItems: "center", borderRadius: 17, background: "linear-gradient(135deg,var(--erp-accent),var(--erp-accent-2))" }}>
            <UsersRound size={29} />
          </div>
          <div>
            <h1 style={{ margin: 0, color: "var(--erp-accent)", fontSize: "clamp(28px,4vw,41px)" }}>{copy.title}</h1>
            <p style={{ margin: "7px 0 0", color: "var(--erp-muted)" }}>{copy.subtitle}</p>
          </div>
        </div>
        <button onClick={load} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 8, border: 0, borderRadius: 13, padding: "11px 15px", background: "var(--erp-glow)", color: "var(--erp-accent)", fontWeight: 900, cursor: "pointer" }}>
          <RefreshCw size={17} /> {loading ? "..." : fa ? "به‌روزرسانی" : language === "ar" ? "تحديث" : language === "tr" ? "Yenile" : "Refresh"}
        </button>
      </header>

      {error && <div className="text-red-200" style={{ ...card, padding: 15, marginBottom: 18 }}>{error}</div>}

      <form onSubmit={submit} style={{ ...card, padding: 20, marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 16px", color: "var(--erp-accent-2)", display: "flex", gap: 8, alignItems: "center" }}><Plus size={21} />{copy.create}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 11 }}>
          <input style={input} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: language === "fa" ? toPersianDigits(e.target.value) : e.target.value })} placeholder={copy.fullName} />
          <input style={input} value={language === "fa" ? toPersianDigits(form.username) : form.username} onChange={(e) => setForm({ ...form, username: toEnglishDigits(e.target.value) })} placeholder={copy.username} autoComplete="off" />
          <label style={{ position: "relative" }}>
            <KeyRound size={16} style={{ position: "absolute", top: 14, insetInlineStart: 12, color: "var(--erp-muted)" }} />
            <input type="password" style={{ ...input, paddingInlineStart: 38 }} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={copy.password} autoComplete="new-password" />
            <small style={{ color: "var(--erp-muted)" }}>{copy.passwordHint}</small>
          </label>
          <Select
            value={form.role}
            onChange={(value) => setForm({ ...form, role: value })}
            options={roles.map((role) => ({ value: role.code, label: roleNames[role.code] || role.label }))}
          />
          {isSuperAdmin && (
            <Select
              value={form.company_id}
              onChange={(value) => setForm({ ...form, company_id: value })}
              options={[{ value: "", label: copy.company }, ...companies.map((company) => ({ value: company.id, label: company.name }))]}
            />
          )}
          {isSuperAdmin && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--erp-text)" }}>
              <input type="checkbox" checked={form.is_super_admin} onChange={(e) => setForm({ ...form, is_super_admin: e.target.checked })} />
              {copy.superAdmin}
            </label>
          )}
          <button disabled={creating} type="submit" style={{ border: 0, borderRadius: 13, minHeight: 45, padding: "11px 16px", background: "linear-gradient(135deg,var(--erp-accent),var(--erp-accent-2))", color: "#03111f", fontWeight: 950, cursor: "pointer" }}>
            {creating ? "..." : copy.add}
          </button>
        </div>
      </form>

      <form onSubmit={submitCustomRole} style={{ ...card, padding: 20, marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 16px", color: "var(--erp-accent-2)", display: "flex", gap: 8, alignItems: "center" }}>
          <Shield size={20} />
          {fa ? "نقش‌های سفارشی" : language === "ar" ? "الأدوار المخصصة" : language === "tr" ? "Özel Roller" : "Custom Roles"}
        </h2>
        <p style={{ margin: "0 0 14px", color: "var(--erp-muted)", fontSize: 13 }}>
          {fa
            ? "نقش سفارشی دقیقاً همان دسترسی‌های یکی از نقش‌های پایه را دارد، فقط با نامی متفاوت؛ می‌توانید همچنین آن را به «فقط مشتریان اختصاص‌یافته به خودم» محدود کنید."
            : language === "ar"
            ? "الدور المخصص يحصل بالضبط على صلاحيات أحد الأدوار الأساسية، تحت اسم مختلف فقط؛ يمكنك أيضًا تقييده بعرض عملائه المخصصين فقط."
            : language === "tr"
            ? "Özel bir rol, temel rollerden birinin yetkilerini birebir alır, sadece adı farklıdır; isterseniz yalnızca kendisine atanan müşterileri görecek şekilde kısıtlayabilirsiniz."
            : "A custom role gets exactly the permissions of one base role, just under a different name; you can also restrict it to only its own assigned customers."}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 11, alignItems: "end" }}>
          <input style={input} value={customRoleForm.code} onChange={(e) => setCustomRoleForm({ ...customRoleForm, code: e.target.value.toLowerCase().replace(/\s+/g, "_") })} placeholder={fa ? "کد (مثلاً senior_sales)" : "code (e.g. senior_sales)"} />
          <input style={input} value={customRoleForm.label} onChange={(e) => setCustomRoleForm({ ...customRoleForm, label: e.target.value })} placeholder={fa ? "عنوان نمایشی" : language === "ar" ? "العنوان المعروض" : language === "tr" ? "Görünen ad" : "Display label"} />
          <Select
            value={customRoleForm.base_role}
            onChange={(value) => setCustomRoleForm({ ...customRoleForm, base_role: value })}
            options={roles.filter((r) => !customRoles.some((cr) => cr.code === r.code) && r.code !== "admin" && r.code !== "user").map((r) => ({ value: r.code, label: roleNames[r.code] || r.label }))}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--erp-text)" }}>
            <input type="checkbox" checked={customRoleForm.restrict_customers_to_own} onChange={(e) => setCustomRoleForm({ ...customRoleForm, restrict_customers_to_own: e.target.checked })} />
            {fa ? "فقط مشتریان خودش" : language === "ar" ? "عملاؤه فقط" : language === "tr" ? "Sadece kendi müşterileri" : "Own customers only"}
          </label>
          <button disabled={creatingCustomRole} type="submit" style={{ border: 0, borderRadius: 13, minHeight: 45, padding: "11px 16px", background: "linear-gradient(135deg,var(--erp-accent),var(--erp-accent-2))", color: "#03111f", fontWeight: 950, cursor: "pointer" }}>
            {creatingCustomRole ? "..." : (fa ? "ایجاد نقش" : language === "ar" ? "إنشاء الدور" : language === "tr" ? "Rol oluştur" : "Create role")}
          </button>
        </div>

        {customRoles.length > 0 && (
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            {customRoles.map((cr) => (
              <div key={cr.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, background: "var(--erp-panel-solid)" }}>
                <div>
                  <b>{cr.label}</b>{" "}
                  <span style={{ color: "var(--erp-muted)", fontSize: 12 }}>
                    ({cr.code} → {roleNames[cr.base_role] || cr.base_role}{cr.restrict_customers_to_own ? `, ${fa ? "فقط مشتریان خودش" : "own customers only"}` : ""})
                  </span>
                </div>
                <button type="button" onClick={() => removeCustomRole(cr.id)} style={{ border: 0, borderRadius: 10, padding: "7px 12px", background: "rgba(248,113,113,.15)", color: "#fca5a5", fontWeight: 800, cursor: "pointer" }}>
                  {fa ? "حذف" : language === "ar" ? "حذف" : language === "tr" ? "Sil" : "Delete"}
                </button>
              </div>
            ))}
          </div>
        )}
      </form>

      <section style={{ ...card, padding: 20 }}>
        <h2 style={{ margin: "0 0 16px", color: "var(--erp-accent)", display: "flex", alignItems: "center", gap: 9 }}><UserCog />{copy.users} ({n(users.length)})</h2>
        <div style={{ display: "grid", gap: 12 }}>
          {!loading && users.length === 0 && <div style={{ color: "var(--erp-muted)", textAlign: "center", padding: 28 }}>{copy.noUsers}</div>}
          {users.map((target) => {
            const role = roles.find((item) => item.code === target.role);
            const self = target.id === user.id;
            return (
              <article key={target.id} style={{ borderRadius: 18, padding: 16, background: "var(--erp-panel-solid)", border: self ? "1px solid var(--erp-accent)" : "1px solid var(--erp-border)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(180px,1fr) minmax(150px,.6fr) minmax(250px,1.5fr) auto", alignItems: "center", gap: 12 }}>
                  <div>
                    <strong style={{ fontSize: 17 }}>{target.full_name}</strong>
                    <div style={{ color: "var(--erp-muted)", marginTop: 4, direction: "ltr", textAlign: dir === "rtl" ? "right" : "left" }}>@{target.username}</div>
                    {self && <span style={{ display: "inline-block", marginTop: 6, color: "var(--erp-accent)", fontSize: 12 }}>{copy.current}</span>}
                    {target.must_change_password && <span style={{ display: "inline-block", marginTop: 6, marginInlineStart: 6, color: "#fbbf24", fontSize: 12 }}>{copy.forced}</span>}
                    {isSuperAdmin && target.company_name && (
                      <div style={{ marginTop: 6, color: "var(--erp-muted)", fontSize: 12 }}>{copy.company}: {target.company_name}</div>
                    )}
                    {target.is_super_admin && (
                      <span style={{ display: "inline-block", marginTop: 6, color: "var(--erp-accent-2)", fontSize: 12, fontWeight: 900 }}>{copy.superAdmin}</span>
                    )}
                  </div>
                  <Select
                    value={roleSelections[target.id] ?? (target.role === "user" ? "viewer" : target.role)}
                    onChange={(value) => setRoleSelections((current) => ({ ...current, [target.id]: value }))}
                    disabled={self}
                    options={roles.map((item) => ({ value: item.code, label: roleNames[item.code] || item.label }))}
                  />
                  <div>
                    <div style={{ color: "var(--erp-muted)", fontSize: 12, marginBottom: 7 }}>{copy.capabilities}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {(role?.capabilities || ["read"]).map((capability) => (
                        <span key={capability} style={{ borderRadius: 999, padding: "5px 9px", color: "var(--erp-muted)", background: "var(--erp-panel)", fontSize: 11 }}>
                          {capabilityNames[capability] || capability}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    <button onClick={() => saveRole(target)} disabled={self || busyId === target.id} style={{ display: "flex", alignItems: "center", gap: 7, border: 0, borderRadius: 12, padding: "10px 13px", background: self ? "var(--erp-panel-solid)" : "var(--erp-glow)", color: self ? "var(--erp-muted)" : "var(--erp-accent)", fontWeight: 900, cursor: self ? "not-allowed" : "pointer" }}>
                      <Save size={16} />{busyId === target.id ? "..." : copy.save}
                    </button>
                    <label style={{ display: "grid", gap: 5, color: "#fed7aa", fontSize: 12 }}>
                      {copy.temporaryPassword}
                      <input
                        type="password"
                        value={(resetForms[target.id] || {}).password || ""}
                        onChange={(event) => updateResetForm(target.id, { password: event.target.value })}
                        placeholder={copy.passwordHint}
                        autoComplete="new-password"
                        style={{ ...input, padding: "9px 10px" }}
                      />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#fdba74", fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={(resetForms[target.id] || {}).force !== false}
                        onChange={(event) => updateResetForm(target.id, { force: event.target.checked })}
                      />
                      {copy.forceNextLogin}
                    </label>
                    <button onClick={() => resetPassword(target)} disabled={busyId === target.id} style={{ display: "flex", alignItems: "center", gap: 7, border: 0, borderRadius: 12, padding: "10px 13px", background: "#7c2d12", color: "#ffedd5", fontWeight: 900, cursor: "pointer" }}>
                      <KeyRound size={16} />{busyId === target.id ? "..." : copy.resetPassword}
                    </button>
                    <small style={{ color: "#fb923c", lineHeight: 1.5 }}>{copy.resetPrompt}</small>
                    {isSuperAdmin && (
                      <>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Select
                            className="flex-1"
                            value={moveTargets[target.id] || ""}
                            onChange={(value) => setMoveTargets((current) => ({ ...current, [target.id]: value }))}
                            options={[{ value: "", label: copy.moveCompany }, ...companies.filter((company) => company.id !== target.company_id).map((company) => ({ value: company.id, label: company.name }))]}
                          />
                          <button
                            onClick={() => moveUserCompany(target)}
                            disabled={busyId === target.id || !moveTargets[target.id]}
                            style={{ border: 0, borderRadius: 12, padding: "9px 13px", background: "var(--erp-glow)", color: "var(--erp-accent)", fontWeight: 900, cursor: "pointer" }}
                          >
                            {copy.move}
                          </button>
                        </div>
                        <button
                          onClick={() => toggleSuperAdmin(target)}
                          disabled={self || busyId === target.id}
                          style={{ border: 0, borderRadius: 12, padding: "10px 13px", background: target.is_super_admin ? "rgba(248,113,113,.15)" : "var(--erp-glow)", color: target.is_super_admin ? "#fca5a5" : "var(--erp-accent)", fontWeight: 900, cursor: self ? "not-allowed" : "pointer" }}
                        >
                          {target.is_super_admin ? copy.revokeSuperAdmin : copy.grantSuperAdmin}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="text-green-200" style={{ ...card, padding: 16, marginTop: 18, display: "flex", gap: 10, alignItems: "center", borderColor: "rgba(34,197,94,.3)" }}>
        <Shield />
        {fa ? "تمام تغییرات نقش در مرکز حسابرسی ثبت می‌شوند." : language === "ar" ? "يتم تسجيل كل تغيير في الدور في مركز التدقيق." : language === "tr" ? "Her rol değişikliği denetim merkezinde kaydedilir." : "Every role change is recorded in the audit center."}
      </div>
    </div>
  );
}
