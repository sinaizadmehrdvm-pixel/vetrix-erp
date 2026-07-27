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
  const { dir } = useLanguage();
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
          direction: dir,
          textDecoration: "none",
          cursor: to ? "pointer" : "default",
          // Makes the value font size react to this card's own width
          // instead of the viewport - in an auto-fit grid, growing the
          // window adds more columns rather than widening each card, so
          // a vw-based size overshoots badly and forces awkward wrapping.
          containerType: "inline-size",
        }}
      >
        <div
          style={{
            textAlign: dir === "rtl" ? "right" : "left",
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
              fontSize: "clamp(15px, 8.5cqi, 28px)",
              fontWeight: "bold",
              letterSpacing: 0.3,
              lineHeight: 1.3,
              wordBreak: "keep-all",
              overflowWrap: "normal",
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
