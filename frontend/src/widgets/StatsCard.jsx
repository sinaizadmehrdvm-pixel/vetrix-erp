import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { useLanguage } from "../localization/useLanguage";

export default function StatsCard({
  title,
  value,
  icon,
  color = "var(--erp-accent)",
  to,
}) {
  const { dir } = useLanguage();
  const reduceMotion = useReducedMotion();
  const Wrapper = to ? Link : "div";
  const wrapperProps = to ? { to } : {};

  return (
    <motion.div
      whileHover={reduceMotion ? undefined : { y: -3 }}
      whileTap={reduceMotion || !to ? undefined : { y: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Wrapper
        {...wrapperProps}
        className="erp-surface"
        style={{
          borderRadius: "var(--erp-radius-lg)",
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
              marginBottom: 8,
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </div>

          <div
            style={{
              fontSize: "clamp(16px, 9cqi, 30px)",
              fontWeight: 900,
              letterSpacing: 0.2,
              lineHeight: 1.25,
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
            borderRadius: "var(--erp-radius-md)",
            background: `color-mix(in srgb, ${color} 16%, transparent)`,
            border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 30,
            color,
            boxShadow: `0 10px 30px -12px color-mix(in srgb, ${color} 55%, transparent)`,
          }}
        >
          {icon}
        </div>
      </Wrapper>
    </motion.div>
  );
}
