import { useEffect, useState } from "react";
import { useLanguage } from "../localization/useLanguage";

export default function LiveClock() {
  const [time, setTime] = useState(new Date());

  const { language } = useLanguage();

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div
      style={{
        color: "#22d3ee",
        fontWeight: 800,
        background: "rgba(15,23,42,0.8)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 18,
        padding: "12px 18px",
      }}
    >
      {time.toLocaleTimeString(
        language === "fa"
          ? "fa-IR"
          : "en-US"
      )}
    </div>
  );
}