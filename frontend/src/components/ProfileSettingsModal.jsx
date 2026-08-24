import { useState } from "react";
import { X } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../localization/useLanguage";
import Modal from "./ui/Modal";
import Field, { Input } from "./ui/Field";
import Button from "./ui/Button";
import AvatarUploadButton from "./AvatarUploadButton";

// Self-service "who am I" editor - picture + display name only, opened from
// the ProfileMenu widget that Sidebar renders on every page (the social-
// network-style "click your own avatar to edit it" pattern). Deliberately
// does not touch role/username/password: those stay in UserManagement.jsx
// (admin CRUD) and the existing account-security password-change flow.
export default function ProfileSettingsModal({ open, onClose }) {
  const { user, updateProfile } = useAuth();
  const { language } = useLanguage();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) =>
    fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  const [fullName, setFullName] = useState(user?.full_name || "");
  const [avatarData, setAvatarData] = useState(user?.avatar_data || "");
  const [saving, setSaving] = useState(false);

  async function handleAvatarChange(dataUrl) {
    const previous = avatarData;
    setAvatarData(dataUrl);
    try {
      await updateProfile({ avatar_data: dataUrl });
      toast.success(tr("عکس پروفایل به‌روزرسانی شد", "تم تحديث صورة الملف الشخصي", "Profil fotoğrafı güncellendi", "Profile picture updated"));
    } catch (err) {
      setAvatarData(previous);
      toast.error(err.message);
    }
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!fullName.trim()) return;
    setSaving(true);
    try {
      await updateProfile({ full_name: fullName.trim() });
      toast.success(tr("پروفایل ذخیره شد", "تم حفظ الملف الشخصي", "Profil kaydedildi", "Profile saved"));
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidthClassName="max-w-sm" labelledBy="profile-settings-title">
      <form onSubmit={handleSave} className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="profile-settings-title" className="text-lg font-black">
            {tr("پروفایل من", "ملفي الشخصي", "Profilim", "My profile")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[var(--erp-radius-sm)]"
            style={{ color: "var(--erp-muted)" }}
            aria-label={tr("بستن", "إغلاق", "Kapat", "Close")}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col items-center gap-2">
          <AvatarUploadButton name={fullName || user?.full_name} avatarData={avatarData} size={84} onChange={handleAvatarChange} tr={tr} />
          <span style={{ fontSize: 12, color: "var(--erp-muted)" }}>
            {tr("برای تغییر عکس کلیک کنید", "انقر لتغيير الصورة", "Değiştirmek için tıklayın", "Click to change photo")}
          </span>
        </div>

        <Field label={tr("نام و نام خانوادگی", "الاسم الكامل", "Ad soyad", "Full name")} htmlFor="profile-full-name" required>
          <Input id="profile-full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>

        <div className="flex items-center gap-2 pt-1">
          <Button type="submit" variant="accent" loading={saving} disabled={saving} className="flex-1">
            {tr("ذخیره", "حفظ", "Kaydet", "Save")}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            {tr("انصراف", "إلغاء", "İptal", "Cancel")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
