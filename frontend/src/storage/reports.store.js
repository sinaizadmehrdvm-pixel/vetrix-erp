import { getCache, setCache } from "./db";

const KEY = "reports";

export async function getReportsOffline() {
  return (await getCache(KEY)) || null;
}

export async function saveReportsOffline(reportData) {
  const payload = {
    updated_at: new Date().toISOString(),
    data: reportData,
  };

  await setCache(KEY, payload);

  return payload;
}

export async function clearReportsOffline() {
  await setCache(KEY, null);
  return true;
}