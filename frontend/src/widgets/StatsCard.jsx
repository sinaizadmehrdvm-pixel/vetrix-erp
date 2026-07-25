import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useLanguage } from "../localization/useLanguage";

export default function StatsCard({
  title,
  value,
  icon,
  color = "#22d3ee",
  to,
}) {
  const { language } = useLanguage();
  const Wrapper = to ? Link : "div";
  const wrapperProps = to ? { to } : {};

  return (
    <motion.div whileHover={{ scale: 1.03 }} whileTap={to ? { scale: 0.98 } : undefined}>
      <Wrapper
        {...wrapperProps}
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
          textDecoration: "none",
          cursor: to ? "pointer" : "default",
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
              fontSize: "clamp(16px, 2.3vw, 30px)",
              fontWeight: "bold",
              letterSpacing: 0.5,
              lineHeight: 1.25,
              overflowWrap: "anywhere",
              color: "var(--erp-text)",
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
      </Wrapper>
    </motion.div>
  );
}
