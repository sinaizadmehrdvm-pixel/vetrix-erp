import { motion } from "framer-motion";

export default function AnimatedCard({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      transition={{ duration: 0.3 }}
      style={{
        borderRadius: 24,
      }}
    >
      {children}
    </motion.div>
  );
}