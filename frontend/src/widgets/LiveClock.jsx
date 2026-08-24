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
      className="erp-surface"
      style={{
        color: "var(--erp-accent)",
        fontWeight: 800,
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