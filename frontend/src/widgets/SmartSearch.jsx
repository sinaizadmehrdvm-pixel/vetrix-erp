import { Search } from "lucide-react";
import { useLanguage } from "../localization/useLanguage";

export default function SmartSearch({
  value,
  onChange,
  placeholder,
}) {
  const { t, language } = useLanguage();

  const isFa = language === "fa";

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        direction: isFa ? "rtl" : "ltr",
      }}
    >
      <Search
        size={18}
        color="#22d3ee"
        style={{
          position: "absolute",
          top: "50%",
          transform: "translateY(-50%)",
          left: isFa ? "auto" : 16,
          right: isFa ? 16 : "auto",
          pointerEvents: "none",
        }}
      />

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || t.smartSearch || t.search}
        style={{
          width: "100%",
          padding: isFa
            ? "14px 48px 14px 18px"
            : "14px 18px 14px 48px",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(15,23,42,0.9)",
          color: "white",
          outline: "none",
          fontSize: 15,
          fontWeight: 600,
          textAlign: isFa ? "right" : "left",
          boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
        }}
      />
    </div>
  );
}