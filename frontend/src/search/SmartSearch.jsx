import { Search } from "lucide-react";
import { useLanguage } from "../localization/LanguageContext";

export default function SmartSearch({
  value,
  onChange,
  placeholder,
}) {
  const { t, language } = useLanguage();

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        direction: language === "fa" ? "rtl" : "ltr",
      }}
    >
      <Search
        size={18}
        color="#22d3ee"
        style={{
          position: "absolute",
          top: "50%",
          transform: "translateY(-50%)",
          left: language === "fa" ? "unset" : 16,
          right: language === "fa" ? 16 : "unset",
        }}
      />

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || t.smartSearch}
        style={{
          width: "100%",
          padding:
            language === "fa"
              ? "14px 48px 14px 18px"
              : "14px 18px 14px 48px",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(15,23,42,0.9)",
          color: "white",
          outline: "none",
          fontSize: 15,
          fontWeight: 600,
          textAlign: language === "fa" ? "right" : "left",
          boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
        }}
      />
    </div>
  );
}