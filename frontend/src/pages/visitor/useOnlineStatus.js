import { useEffect, useState } from "react";

// Pure UI-state hook (is the badge red or not) - distinct from
// storage/offlineSync.js's useOnlineSync, which triggers the actual queue
// replay rather than tracking a boolean for display.
export function useOnlineStatus() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    function goOnline() { setOnline(true); }
    function goOffline() { setOnline(false); }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
