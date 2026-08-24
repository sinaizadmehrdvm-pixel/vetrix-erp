import { useEffect, useRef } from "react";
import { useStableCallback } from "../hooks/useStableCallback";

/**
 * Replays locally-queued create/update calls created while offline (tagged
 * pending_sync: true by Invoices/Customers/Products' existing catch-block
 * fallback) against the real API, one at a time, in original order so
 * earlier records don't jump ahead of later ones.
 *
 * A record's raw submission payload lives inline on the record itself
 * (spread in at offline-save time), so extractPayload just needs to pick
 * those fields back out - see each page's own extractPayload for the shape.
 */
export async function syncPendingRecords(items, { extractPayload, create, update, mergeResult }) {
  const list = Array.isArray(items) ? [...items] : [];
  let syncedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (!item?.pending_sync) continue;

    try {
      const payload = extractPayload(item);
      const result = item.offline_created
        ? await create(payload)
        : await update(item.id, payload);
      list[i] = mergeResult(item, result, payload);
      syncedCount += 1;
    } catch {
      failedCount += 1;
    }
  }

  return { items: list, syncedCount, failedCount };
}

/** Runs `onOnline` once on mount if already online, and again every time the
 * browser regains connectivity - the natural trigger to flush the outbox.
 * Real devices can fire more than one "online" event in quick succession on
 * a flaky reconnect (e.g. Wi-Fi then cellular both flipping the flag); a
 * running-lock keeps two overlapping syncs from both reading the same
 * pending record and double-submitting it. */
export function useOnlineSync(onOnline) {
  const stableOnOnline = useStableCallback(onOnline);
  const runningRef = useRef(false);

  useEffect(() => {
    const run = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        await stableOnOnline();
      } finally {
        runningRef.current = false;
      }
    };

    if (typeof navigator !== "undefined" && navigator.onLine) {
      run();
    }
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, [stableOnOnline]);
}

export function countPending(items) {
  return Array.isArray(items) ? items.filter((item) => item?.pending_sync).length : 0;
}
