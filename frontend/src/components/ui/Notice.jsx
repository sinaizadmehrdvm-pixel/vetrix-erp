import { motion, useReducedMotion } from "framer-motion";
import { TONE_STYLES } from "./tones";

// Block-level callout/banner - shares Badge's tone tokens so a page's small
// status pills and its larger alert banners always agree on color.
export default function Notice({ tone = "info", icon: Icon, className = "", children }) {
  const style = TONE_STYLES[tone] || TONE_STYLES.info;
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.2 }}
      role={tone === "danger" ? "alert" : undefined}
      className={["rounded-[var(--erp-radius-lg)] p-4 text-sm font-medium", className].join(" ")}
      style={style}
    >
      {Icon ? <Icon className="mb-2" size={22} /> : null}
      {children}
    </motion.div>
  );
}
