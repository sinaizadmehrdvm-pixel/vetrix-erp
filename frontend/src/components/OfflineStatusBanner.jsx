import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useLanguage } from "../localization/useLanguage";

export default function OfflineStatusBanner() {
  const { dir, language } = useLanguage();
  const fa = language === "fa";
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" && !navigator.onLine
  );

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      dir={dir}
      data-testid="offline-status-banner"
      className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-amber-500/15 border border-amber-400/30 text-amber-100"
    >
      <WifiOff size={16} />
      {fa
        ? "اتصال اینترنت قطع است. برنامه در حالت آفلاین کار می‌کند؛ تغییرات پس از اتصال دوباره همگام‌سازی می‌شوند."
        : "You're offline. The app is working from cached data; changes will sync automatically once you're back online."}
    </div>
  );
}
