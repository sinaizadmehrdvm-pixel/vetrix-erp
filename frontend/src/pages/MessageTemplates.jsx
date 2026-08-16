import { useEffect, useMemo, useState } from "react";
import { MessageSquareText, RotateCcw, Save, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import toast from "react-hot-toast";

import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../localization/useLanguage";
import {
  getMessageTemplates,
  updateMessageTemplate,
  resetMessageTemplate,
  getMessageTemplateEditors,
  grantMessageTemplateEditor,
  revokeMessageTemplateEditor,
} from "../services/api";
import { getUsers } from "../services/usersApi";
import { translateApiError } from "../localization/apiErrors";
import Select from "../components/ui/Select";

const CHANNEL_LABELS = {
  email: { fa: "ایمیل", ar: "البريد الإلكتروني", tr: "E-posta", en: "Email" },
};

export default function MessageTemplates() {
  const { language, dir } = useLanguage();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const tr = (fa, ar, trText, en) => (language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? trText : en);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState({});
  const [savingKey, setSavingKey] = useState(null);
  const [activeLanguage, setActiveLanguage] = useState(language);

  const [editors, setEditors] = useState([]);
  const [users, setUsers] = useState([]);
  const [grantUserId, setGrantUserId] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await getMessageTemplates();
      setItems(data.items || []);
    } catch (err) {
      toast.error(translateApiError(err.message, language) || err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadEditors() {
    if (!isAdmin) return;
    try {
      const [editorsData, usersData] = await Promise.all([getMessageTemplateEditors(), getUsers()]);
      setEditors(editorsData.items || []);
      setUsers(Array.isArray(usersData) ? usersData : usersData?.items || []);
    } catch (err) {
      toast.error(translateApiError(err.message, language) || err.message);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void load(); void loadEditors(); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const grouped = useMemo(() => {
    const byKey = new Map();
    for (const item of items) {
      if (item.language !== activeLanguage) continue;
      if (!byKey.has(item.key)) byKey.set(item.key, []);
      byKey.get(item.key).push(item);
    }
    return Array.from(byKey.entries());
  }, [items, activeLanguage]);

  function draftFor(item) {
    const dKey = `${item.key}:${item.channel}:${item.language}`;
    return drafts[dKey] ?? { subject: item.subject, body: item.body };
  }

  function setDraft(item, patch) {
    const dKey = `${item.key}:${item.channel}:${item.language}`;
    setDrafts((prev) => ({ ...prev, [dKey]: { ...draftFor(item), ...patch } }));
  }

  async function save(item) {
    const dKey = `${item.key}:${item.channel}:${item.language}`;
    setSavingKey(dKey);
    try {
      const draft = draftFor(item);
      await updateMessageTemplate(item.key, item.channel, item.language, draft);
      toast.success(tr("ذخیره شد.", "تم الحفظ.", "Kaydedildi.", "Saved."));
      await load();
    } catch (err) {
      toast.error(translateApiError(err.message, language) || err.message);
    } finally {
      setSavingKey(null);
    }
  }

  async function resetToDefault(item) {
    if (!window.confirm(tr("متن به حالت پیش‌فرض برگردد؟", "إعادة النص إلى الوضع الافتراضي؟", "Metin varsayılana döndürülsün mü?", "Reset text to the default?"))) return;
    try {
      await resetMessageTemplate(item.key, item.channel, item.language);
      toast.success(tr("بازگردانده شد.", "تمت الإعادة.", "Sıfırlandı.", "Reset."));
      const dKey = `${item.key}:${item.channel}:${item.language}`;
      setDrafts((prev) => { const next = { ...prev }; delete next[dKey]; return next; });
      await load();
    } catch (err) {
      toast.error(translateApiError(err.message, language) || err.message);
    }
  }

  async function grantEditor() {
    if (!grantUserId) return;
    try {
      await grantMessageTemplateEditor(Number(grantUserId));
      toast.success(tr("دسترسی داده شد.", "تم منح الوصول.", "Erişim verildi.", "Access granted."));
      setGrantUserId("");
      await loadEditors();
    } catch (err) {
      toast.error(translateApiError(err.message, language) || err.message);
    }
  }

  async function revokeEditor(userId) {
    try {
      await revokeMessageTemplateEditor(userId);
      toast.success(tr("دسترسی لغو شد.", "تم إلغاء الوصول.", "Erişim iptal edildi.", "Access revoked."));
      await loadEditors();
    } catch (err) {
      toast.error(translateApiError(err.message, language) || err.message);
    }
  }

  const nonEditorUsers = users.filter((u) => u.role !== "admin" && !editors.some((e) => e.user_id === u.id));

  return (
    <div dir={dir} className="p-4 md:p-6 space-y-6 text-[var(--erp-text)]">
      <div>
        <h1 className="text-2xl font-black flex items-center gap-2">
          <MessageSquareText className="text-[var(--erp-accent)]" />
          {tr("قالب‌های پیام مشتریان", "قوالب رسائل العملاء", "Müşteri mesaj şablonları", "Customer message templates")}
        </h1>
        <p className="text-[var(--erp-muted)] mt-2">
          {tr(
            "متن‌هایی که برای مشتریان ارسال می‌شود (مثلاً یادآوری پرداخت) را اینجا برای هر زبان ویرایش کن. تغییرات فوراً برای همه ارسال‌های بعدی اعمال می‌شود.",
            "حرّر هنا النصوص المُرسلة للعملاء (مثل تذكير الدفع) لكل لغة. تُطبَّق التغييرات فورًا على جميع الإرسالات اللاحقة.",
            "Müşterilere gönderilen metinleri (örn. ödeme hatırlatması) burada her dil için düzenleyin. Değişiklikler sonraki tüm gönderimlere hemen uygulanır.",
            "Edit the text sent to customers (e.g. payment reminders) here, per language. Changes apply immediately to every future send."
          )}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {["fa", "ar", "tr", "en"].map((lang) => (
          <button
            key={lang}
            onClick={() => setActiveLanguage(lang)}
            className={`px-4 py-2 rounded-xl font-bold text-sm ${activeLanguage === lang ? "bg-[var(--erp-accent)] text-black" : "bg-[var(--erp-panel-solid)] text-[var(--erp-muted)]"}`}
          >
            {{ fa: "فارسی", ar: "العربية", tr: "Türkçe", en: "English" }[lang]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-[var(--erp-muted)]">{tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(([key, group]) => (
            <div key={key} className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-panel)] p-5">
              <h2 className="font-black mb-3">{group[0].label}</h2>
              {group.map((item) => {
                const dKey = `${item.key}:${item.channel}:${item.language}`;
                const draft = draftFor(item);
                return (
                  <div key={dKey} className="space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-bold px-2 py-1 rounded-lg bg-[var(--erp-panel-solid)] text-[var(--erp-muted)]">
                        {CHANNEL_LABELS[item.channel]?.[language] || item.channel}
                      </span>
                      {item.is_customized && (
                        <span className="text-xs font-bold text-amber-300">{tr("سفارشی‌شده", "مخصّص", "Özelleştirildi", "Customized")}</span>
                      )}
                    </div>
                    {item.channel === "email" && (
                      <input
                        className="w-full p-3 rounded-xl bg-[var(--erp-bg)] border border-[var(--erp-border)] outline-none"
                        placeholder={tr("موضوع ایمیل", "عنوان الرسالة", "E-posta konusu", "Email subject")}
                        value={draft.subject}
                        onChange={(e) => setDraft(item, { subject: e.target.value })}
                      />
                    )}
                    <textarea
                      className="w-full p-3 rounded-xl bg-[var(--erp-bg)] border border-[var(--erp-border)] outline-none"
                      rows={6}
                      value={draft.body}
                      onChange={(e) => setDraft(item, { body: e.target.value })}
                    />
                    <p className="text-xs text-[var(--erp-muted)]">
                      {tr("جای‌نگهدارهای قابل استفاده: {name} {id} {amount} {brand}", "المتغيرات المتاحة: {name} {id} {amount} {brand}", "Kullanılabilir yer tutucular: {name} {id} {amount} {brand}", "Available placeholders: {name} {id} {amount} {brand}")}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => save(item)}
                        disabled={savingKey === dKey}
                        className="px-4 py-2 rounded-xl bg-[var(--erp-accent)] text-black font-bold text-sm flex items-center gap-1 disabled:opacity-60"
                      >
                        <Save size={14} /> {savingKey === dKey ? tr("در حال ذخیره...", "جارٍ الحفظ...", "Kaydediliyor...", "Saving...") : tr("ذخیره", "حفظ", "Kaydet", "Save")}
                      </button>
                      {item.is_customized && (
                        <button onClick={() => resetToDefault(item)} className="px-4 py-2 rounded-xl bg-[var(--erp-panel-solid)] text-[var(--erp-muted)] font-bold text-sm flex items-center gap-1">
                          <RotateCcw size={14} /> {tr("بازگشت به پیش‌فرض", "استعادة الافتراضي", "Varsayılana dön", "Reset to default")}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {grouped.length === 0 && (
            <p className="text-[var(--erp-muted)]">{tr("قالبی برای این زبان یافت نشد.", "لا توجد قوالب لهذه اللغة.", "Bu dil için şablon bulunamadı.", "No templates found for this language.")}</p>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-panel)] p-5">
          <h2 className="font-black mb-2 flex items-center gap-2"><ShieldCheck size={18} className="text-[var(--erp-accent)]" /> {tr("دسترسی ویرایش (تیم مجاز)", "صلاحية التعديل (الفريق المصرح له)", "Düzenleme erişimi (yetkili ekip)", "Edit access (authorized team)")}</h2>
          <p className="text-sm text-[var(--erp-muted)] mb-4">
            {tr(
              "مدیر همیشه دسترسی کامل دارد. کاربران زیر را می‌توانی اضافه کنی تا آن‌ها هم بتوانند این قالب‌ها را ویرایش کنند، بدون اینکه نقششان تغییر کند.",
              "المدير لديه دائمًا صلاحية كاملة. يمكنك إضافة المستخدمين التاليين لمنحهم إمكانية تعديل هذه القوالب دون تغيير دورهم.",
              "Yönetici her zaman tam erişime sahiptir. Rollerini değiştirmeden bu şablonları düzenleyebilmeleri için aşağıdaki kullanıcıları ekleyebilirsiniz.",
              "The admin always has full access. Add the users below to let them edit these templates too, without changing their role."
            )}
          </p>
          <div className="flex gap-2 flex-wrap mb-4">
            <Select
              className="flex-1 min-w-[200px]"
              value={grantUserId}
              onChange={(value) => setGrantUserId(value)}
              options={[{ value: "", label: tr("انتخاب کاربر...", "اختر مستخدمًا...", "Kullanıcı seçin...", "Select a user...") }, ...nonEditorUsers.map((u) => ({ value: u.id, label: `${u.full_name || u.username} (${u.role})` }))]}
            />
            <button onClick={grantEditor} disabled={!grantUserId} className="px-4 py-3 rounded-xl bg-[var(--erp-accent)] text-black font-bold flex items-center gap-2 disabled:opacity-50">
              <UserPlus size={16} /> {tr("افزودن", "إضافة", "Ekle", "Add")}
            </button>
          </div>
          <div className="space-y-2">
            {editors.map((e) => (
              <div key={e.user_id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--erp-panel-solid)]">
                <span className="font-bold">{e.full_name || e.username}</span>
                <button onClick={() => revokeEditor(e.user_id)} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(239,68,68,.12)", color: "#f87171" }}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {editors.length === 0 && <p className="text-sm text-[var(--erp-muted)]">{tr("هنوز کسی به‌جز مدیر دسترسی ندارد.", "لا أحد لديه صلاحية باستثناء المدير حتى الآن.", "Yöneticiden başka henüz kimsenin erişimi yok.", "No one besides the admin has access yet.")}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
