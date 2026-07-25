import { motion } from "framer-motion";
import { useLanguage } from "../localization/useLanguage";

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
      className="erp-surface"
      style={{
        borderRadius: 24,
        padding: 24,
        color: "var(--erp-text)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 16,
        direction: language === "fa" ? "rtl" : "ltr",
      }}
    >
      <div
        style={{
          textAlign: language === "fa" ? "right" : "left",
          minWidth: 0,
          flex: 1,
        }}
      >
        <div
          style={{
            color: "var(--erp-muted)",
            marginBottom: 10,
            fontSize: 14,
            fontWeight: 700,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </div>

        <div
          style={{
            fontSize: 32,
            fontWeight: "bold",
            letterSpacing: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </div>
      </div>

      <div
        style={{
          width: 70,
          height: 70,
          minWidth: 70,
          minHeight: 70,
          flexShrink: 0,
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