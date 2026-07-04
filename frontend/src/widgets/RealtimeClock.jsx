import { useEffect, useState } from "react";

export default function RealtimeClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return <div className="realtime-clock">{time.toLocaleTimeString()}</div>;
}