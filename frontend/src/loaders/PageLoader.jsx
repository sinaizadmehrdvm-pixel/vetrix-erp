import { motion } from "framer-motion";

export default function PageLoader() {
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#071028",
      }}
    >
      <motion.div
        animate={{
          rotate: 360,
        }}
        transition={{
          repeat: Infinity,
          duration: 1,
          ease: "linear",
        }}
        style={{
          width: 70,
          height: 70,
          borderRadius: "50%",
          border: "5px solid rgba(255,255,255,0.1)",
          borderTop: "5px solid #22d3ee",
        }}
      />
    </div>
  );
}