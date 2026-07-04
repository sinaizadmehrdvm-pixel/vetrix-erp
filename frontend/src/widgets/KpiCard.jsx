import { motion } from "framer-motion";

export default function KpiCard({ title, value, icon, color = "#22d3ee" }) {
  return (
    <motion.div
      whileHover={{ scale: 1.03, y: -4 }}
      transition={{ duration: 0.25 }}
      className="glass-card kpi-card"
    >
      <div>
        <p className="kpi-title">{title}</p>
        <h2 className="kpi-value">{value}</h2>
      </div>

      <div className="kpi-icon" style={{ background: color }}>
        {icon}
      </div>
    </motion.div>
  );
}