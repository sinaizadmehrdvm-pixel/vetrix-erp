import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import toast from "react-hot-toast";
import { compressImage } from "../utils/imageCompression";
import UserAvatar from "./ui/UserAvatar";
import Tooltip from "./ui/Tooltip";

// A UserAvatar with a click-to-replace camera overlay - shared between the
// logged-in user's own profile (ProfileSettingsModal) and an employee's HR
// record (EmployeeProfile.jsx) so both reuse the same compress -> preview
// -> hand-the-data-URL-to-the-caller flow instead of two hand-rolled copies.
// The caller owns the actual save (API call); this component only turns a
// picked file into a compressed base64 data URL.
export default function AvatarUploadButton({ name, avatarData, size = 72, onChange, tr }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const label = tr("تغییر عکس", "تغيير الصورة", "Fotoğrafı değiştir", "Change photo");

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(tr("فقط فایل تصویری مجاز است", "يُسمح فقط بملفات الصور", "Yalnızca resim dosyalarına izin verilir", "Only image files are allowed"));
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await compressImage(file, 320, 0.85);
      await onChange(dataUrl);
    } catch {
      toast.error(tr("بارگذاری تصویر ناموفق بود", "فشل تحميل الصورة", "Resim yüklenemedi", "Failed to upload image"));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    // The tooltip wraps the whole sized container (not just the inner
    // button) - `.vitalix-tooltip` is itself `display:inline-flex`, and the
    // button's `position:absolute; inset:0` needs to keep resolving against
    // this div's own `position:relative` + explicit size, not against the
    // tooltip wrapper, or it collapses to 0x0.
    <Tooltip side="top" label={label}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <UserAvatar name={name} avatarData={avatarData} size={size} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label={label}
          className="hover:!opacity-100 focus-visible:!opacity-100"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: 0,
            background: "var(--erp-avatar-overlay)",
            color: "var(--erp-avatar-initials-text)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: busy ? 1 : 0,
            transition: "opacity .15s ease",
            cursor: busy ? "wait" : "pointer",
          }}
        >
          <Camera size={Math.max(14, Math.round(size * 0.28))} />
        </button>
        <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      </div>
    </Tooltip>
  );
}
