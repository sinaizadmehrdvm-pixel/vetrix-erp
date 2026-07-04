import { motion } from "framer-motion";
import { useLanguage } from "../localization/LanguageContext";

export default function StatsCard({
  title,
  value,
  icon,
  color = "#22d3ee",
}) {
  const { language } = useLanguage();

  return (
    <motion.div
      whileHover={{ scale: 1.03 }}
      style={{
        background: "rgba(15,23,42,0.8)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 24,
        padding: 24,
        color: "white",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        boxShadow: "0 15px 40px rgba(0,0,0,0.3)",
        direction: language === "fa" ? "rtl" : "ltr",
      }}
    >
      <div
        style={{
          textAlign: language === "fa" ? "right" : "left",
        }}
      >
        <div
          style={{
            color: "#94a3b8",
            marginBottom: 10,
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {title}
        </div>

        <div
          style={{
            fontSize: 32,
            fontWeight: "bold",
            letterSpacing: 1,
          }}
        >
          {value}
        </div>
      </div>

      <div
        style={{
          width: 70,
          height: 70,
          borderRadius: 20,
          background: color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 30,
          color: "#071028",
          boxShadow: `0 10px 30px ${color}55`,
        }}
      >
        {icon}
      </div>
    </motion.div>
  );
}