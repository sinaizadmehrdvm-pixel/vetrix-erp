import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useLanguage } from "../../localization/useLanguage";
import { useAuth } from "../../auth/AuthContext";
import { getCustomers, getInvoices, getTransactions, getSalesReps, isNetworkError } from "../../services/api";
import { getFieldVisitSummary, getFieldVisitCoverage, listFieldVisits, createFieldVisit } from "../../services/fieldVisitsApi";
import { translateApiError } from "../../localization/apiErrors";
import { getCache, setCache } from "../../storage/db";
import { syncPendingRecords, useOnlineSync } from "../../storage/offlineSync";
import { getCurrentPosition } from "./geo";
import { isToday, deriveFollowupCustomerIds } from "./fieldSalesHelpers";
import { toNumber } from "../../utils/crmHeuristics";
import { FieldSalesCtx } from "./useFieldSales";

const CUSTOMERS_CACHE_KEY = "visitor_customers";
const PENDING_VISITS_CACHE_KEY = "visitor_pending_visits";
const ACTIVE_VISIT_CACHE_KEY = "visitor_active_visit";
// activeVisit itself already round-trips through this cache so the check-in
// timer survives a full FieldSalesProvider remount (e.g. leaving /visitor
// via the Sidebar or Customer360Drawer's "Open full page" escape hatch, then
// coming back). visitDraft/visitOrders/visitPayments used to be plain
// useState with no such round-trip, so the same remount silently wiped the
// outcome/note/follow-up draft and the orders/payments already recorded
// this visit - this second cache key closes that gap the same way.
const VISIT_SESSION_CACHE_KEY = "visitor_active_visit_session";

function extractVisitPayload(item) {
  return {
    customer_id: Number(item.customer_id),
    visit_time: item.visit_time,
    outcome: item.outcome,
    note: item.note,
    resulting_invoice_id: item.resulting_invoice_id,
    client_ref: item.client_ref,
    check_in_time: item.check_in_time,
    check_in_latitude: item.check_in_latitude,
    check_in_longitude: item.check_in_longitude,
    latitude: item.latitude,
    longitude: item.longitude,
  };
}

async function createVisitForSync(payload) {
  const res = await createFieldVisit(payload);
  if (res?.status !== "created" && res?.status !== "already_recorded") throw new Error("sync failed");
  return res;
}

// Single data/state owner for the whole Field Sales module (/visitor and
// /visitor/visits both mount under this provider - see App.jsx's nested
// "visitor" layout route). Two problems this solves that per-page state
// couldn't:
// 1. The active visit (timer, check-in coords, draft outcome/note) used to
//    live in VisitorVisits.jsx's own useState, restored from an IndexedDB
//    cache on mount - which worked for *reloading* the same page, but a
//    real navigation to /visitor still remounted everything from scratch
//    and (before this) the two pages independently re-fetched the exact
//    same customers/coverage/visits/invoices/transactions lists.
// 2. Embedding Order/Payment/Customer360 as drawers *inside* the active
//    visit only works if opening them doesn't unmount whatever is holding
//    the timer - a Modal rendered from a component that reads this context
//    can open/close freely without touching the timer's own interval.
export function FieldSalesProvider({ children }) {
  const { language, n, date } = useLanguage();
  const { user } = useAuth();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) =>
    fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [summary, setSummary] = useState(null);
  const [coverage, setCoverage] = useState({});
  const [visits, setVisits] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [salesReps, setSalesReps] = useState([]);
  const [activeView, setActiveView] = useState("today");

  const [activeVisit, setActiveVisit] = useState(null);
  const [visitDraft, setVisitDraft] = useState({ outcome: "order_placed", note: "", followUpDate: "" });
  const [visitOrders, setVisitOrders] = useState([]); // invoices created during the current active visit
  const [visitPayments, setVisitPayments] = useState([]); // transactions created during the current active visit
  const [elapsed, setElapsed] = useState(0);
  const [startingVisit, setStartingVisit] = useState(false);
  const [completingVisit, setCompletingVisit] = useState(false);
  const tickRef = useRef(null);

  const scopeId = user?.role === "sales" ? user.id : undefined;

  const refreshCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const data = await getCustomers(scopeId);
      const list = Array.isArray(data) ? data : [];
      setCustomers(list);
      await setCache(CUSTOMERS_CACHE_KEY, list);
    } catch {
      const cached = await getCache(CUSTOMERS_CACHE_KEY);
      if (cached) setCustomers(cached);
    } finally {
      setLoadingCustomers(false);
    }
  }, [scopeId]);

  const refreshCoverage = useCallback(async () => {
    try {
      const result = await getFieldVisitCoverage();
      const map = {};
      for (const item of result.items || []) map[item.customer_id] = item;
      setCoverage(map);
    } catch { /* best-effort */ }
  }, []);

  const refreshSummary = useCallback(async () => {
    try { setSummary(await getFieldVisitSummary("self")); } catch { /* best-effort */ }
  }, []);

  const refreshVisits = useCallback(async () => {
    try { setVisits(await listFieldVisits()); } catch { /* best-effort */ }
  }, []);

  const refreshInvoices = useCallback(async () => {
    try { setInvoices(await getInvoices()); } catch { /* best-effort */ }
  }, []);

  const refreshTransactions = useCallback(async () => {
    try { setTransactions(await getTransactions()); } catch { /* best-effort */ }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshCustomers(), refreshCoverage(), refreshSummary(), refreshVisits(),
      refreshInvoices(), refreshTransactions(),
      (async () => { try { setSalesReps(await getSalesReps()); } catch { /* best-effort */ } })(),
    ]);
  }, [refreshCustomers, refreshCoverage, refreshSummary, refreshVisits, refreshInvoices, refreshTransactions]);

  useEffect(() => {
    const timer = setTimeout(() => { void refreshAll(); }, 0);
    (async () => {
      const saved = await getCache(ACTIVE_VISIT_CACHE_KEY);
      if (!saved) return;
      setActiveVisit(saved);
      const session = await getCache(VISIT_SESSION_CACHE_KEY);
      if (session) {
        if (session.visitDraft) setVisitDraft(session.visitDraft);
        if (session.visitOrders) setVisitOrders(session.visitOrders);
        if (session.visitPayments) setVisitPayments(session.visitPayments);
      }
    })();
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirrors the draft/orders/payments of the active visit into IndexedDB
  // on every change, so a FieldSalesProvider remount (see
  // VISIT_SESSION_CACHE_KEY above) restores them via the mount effect
  // above instead of silently resetting to empty defaults.
  useEffect(() => {
    if (!activeVisit) return;
    void setCache(VISIT_SESSION_CACHE_KEY, { visitDraft, visitOrders, visitPayments });
  }, [activeVisit, visitDraft, visitOrders, visitPayments]);

  useEffect(() => {
    if (!activeVisit) {
      if (tickRef.current) clearInterval(tickRef.current);
      return;
    }
    const start = new Date(activeVisit.check_in_time).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    const initial = setTimeout(tick, 0);
    tickRef.current = setInterval(tick, 1000);
    return () => { clearTimeout(initial); clearInterval(tickRef.current); };
  }, [activeVisit]);

  async function syncPendingVisits() {
    const cached = (await getCache(PENDING_VISITS_CACHE_KEY)) || [];
    if (!cached.some((item) => item.pending_sync)) return;
    const { items: updated, syncedCount } = await syncPendingRecords(cached, {
      extractPayload: extractVisitPayload,
      create: createVisitForSync,
      update: createVisitForSync,
      mergeResult: (item) => ({ ...item, pending_sync: false }),
    });
    await setCache(PENDING_VISITS_CACHE_KEY, updated.filter((item) => item.pending_sync));
    if (syncedCount > 0) {
      toast.success(fa ? `${n(syncedCount)} ویزیت آفلاین همگام‌سازی شد.` : `${n(syncedCount)} offline visit(s) synced.`);
      void refreshVisits();
    }
  }
  useOnlineSync(syncPendingVisits);

  const startVisit = useCallback(async (customerId) => {
    if (!customerId) {
      toast.error(tr("مشتری را انتخاب کنید", "اختر عميلًا", "Müşteri seçin", "Choose a customer"));
      return;
    }
    setStartingVisit(true);
    try {
      const pos = await getCurrentPosition();
      const visit = {
        customer_id: Number(customerId),
        check_in_time: new Date().toISOString(),
        check_in_latitude: pos?.latitude ?? null,
        check_in_longitude: pos?.longitude ?? null,
        client_ref: `visit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      };
      setActiveVisit(visit);
      setVisitDraft({ outcome: "order_placed", note: "", followUpDate: "" });
      setVisitOrders([]);
      setVisitPayments([]);
      await setCache(ACTIVE_VISIT_CACHE_KEY, visit);
      if (!pos) {
        toast(tr("بدون موقعیت مکانی شروع شد", "بدأت بدون تحديد الموقع", "Konum olmadan başlatıldı", "Started without location"), { icon: "⚠️" });
      }
    } finally {
      setStartingVisit(false);
    }
  }, [tr]);

  // Called by FieldOrderDrawer/FieldCollectionDrawer right after a
  // successful save, so the End Visit summary and the visit's own
  // resulting_invoice_id (a real, already-existing field_visits column)
  // reflect what actually happened during THIS visit, not a guess based on
  // timestamps.
  const recordVisitOrder = useCallback((invoice) => {
    setVisitOrders((prev) => [...prev, invoice]);
    void refreshInvoices();
  }, [refreshInvoices]);

  const recordVisitPayment = useCallback((transaction) => {
    setVisitPayments((prev) => [...prev, transaction]);
    void refreshTransactions();
  }, [refreshTransactions]);

  const completeVisit = useCallback(async () => {
    if (!activeVisit) return;
    setCompletingVisit(true);
    try {
      const pos = await getCurrentPosition();
      let note = visitDraft.note;
      if (visitDraft.followUpDate) {
        // No dedicated next_action_date column on field_visits - folded
        // into the existing free-text note field instead of inventing a
        // new backend column for Phase 2 (see final report). The date
        // itself is formatted through the shared date() (Jalali/Hijri/
        // Gregorian per language) before being folded in, since this same
        // note text is later rendered verbatim in VisitorVisits.jsx and
        // Customer360Drawer.jsx - a raw ISO string here would silently
        // reintroduce a Latin-digit, Gregorian-only fragment into an
        // otherwise fully localized note for fa/ar users.
        const label = tr("پیگیری بعدی", "المتابعة القادمة", "Sonraki takip", "Next follow-up");
        const formattedFollowUp = date(visitDraft.followUpDate);
        note = note ? `${note}\n\n${label}: ${formattedFollowUp}` : `${label}: ${formattedFollowUp}`;
      }
      const payload = {
        customer_id: activeVisit.customer_id,
        visit_time: new Date().toISOString(),
        outcome: visitDraft.outcome,
        note,
        resulting_invoice_id: visitOrders[visitOrders.length - 1]?.invoice_id ?? null,
        client_ref: activeVisit.client_ref,
        check_in_time: activeVisit.check_in_time,
        check_in_latitude: activeVisit.check_in_latitude,
        check_in_longitude: activeVisit.check_in_longitude,
        latitude: pos?.latitude ?? activeVisit.check_in_latitude ?? null,
        longitude: pos?.longitude ?? activeVisit.check_in_longitude ?? null,
      };

      const res = await createFieldVisit(payload);
      if (res?.status !== "created" && res?.status !== "already_recorded") throw new Error("failed");
      toast.success(tr("ویزیت با موفقیت تکمیل شد", "تم إكمال الزيارة بنجاح", "Ziyaret başarıyla tamamlandı", "Visit completed"));
      setActiveVisit(null);
      setVisitOrders([]);
      setVisitPayments([]);
      await setCache(ACTIVE_VISIT_CACHE_KEY, null);
      await setCache(VISIT_SESSION_CACHE_KEY, null);
      void refreshVisits();
      void refreshCoverage();
      void refreshSummary();
      return true;
    } catch (error) {
      if (!isNetworkError(error)) {
        toast.error(translateApiError(error.message, language) || tr("ثبت ویزیت ناموفق بود", "فشل تسجيل الزيارة", "Ziyaret kaydedilemedi", "Failed to record visit"));
        return false;
      }
      const payload = {
        customer_id: activeVisit.customer_id,
        visit_time: new Date().toISOString(),
        outcome: visitDraft.outcome,
        note: visitDraft.note,
        resulting_invoice_id: visitOrders[visitOrders.length - 1]?.invoice_id ?? null,
        client_ref: activeVisit.client_ref,
        check_in_time: activeVisit.check_in_time,
        check_in_latitude: activeVisit.check_in_latitude,
        check_in_longitude: activeVisit.check_in_longitude,
        latitude: activeVisit.check_in_latitude,
        longitude: activeVisit.check_in_longitude,
      };
      const cached = (await getCache(PENDING_VISITS_CACHE_KEY)) || [];
      await setCache(PENDING_VISITS_CACHE_KEY, [...cached, { ...payload, id: Date.now(), pending_sync: true }]);
      toast(tr("اتصال برقرار نیست؛ ویزیت ذخیره شد.", "لا يوجد اتصال؛ تم حفظ الزيارة.", "Bağlantı yok; ziyaret kaydedildi.", "No connection; visit saved locally."));
      setActiveVisit(null);
      setVisitOrders([]);
      setVisitPayments([]);
      await setCache(ACTIVE_VISIT_CACHE_KEY, null);
      await setCache(VISIT_SESSION_CACHE_KEY, null);
      return true;
    } finally {
      setCompletingVisit(false);
    }
  }, [activeVisit, visitDraft, visitOrders, language, tr, date, refreshVisits, refreshCoverage, refreshSummary]);

  const activeCustomer = useMemo(
    () => (activeVisit ? customers.find((c) => c.id === activeVisit.customer_id) : null),
    [activeVisit, customers]
  );

  // Shared derivations - computed once here instead of separately inside
  // VisitorHome.jsx and VisitorVisits.jsx (the exact duplication the
  // previous phase left behind). customerIds scopes company-wide
  // invoices/transactions down to this rep's own customers so an admin's
  // full-company totals never leak into a rep's "today" numbers.
  const customerIds = useMemo(() => new Set(customers.map((c) => c.id)), [customers]);
  const followupCustomerIds = useMemo(() => deriveFollowupCustomerIds(visits), [visits]);

  const { lastOrderByCustomer, openOrdersByCustomer, salesToday, ordersTodayFromInvoices, overdueBalanceCustomerIds } = useMemo(() => {
    const lastOrder = new Map();
    const openCount = new Map();
    const overdueBalance = new Set();
    let todayTotal = 0;
    let todayCount = 0;
    const now = new Date();
    for (const inv of invoices) {
      if (!customerIds.has(inv.customer_id)) continue;
      const existing = lastOrder.get(inv.customer_id);
      if (!existing || new Date(inv.created_at) > new Date(existing.created_at)) lastOrder.set(inv.customer_id, inv);
      const remaining = toNumber(inv.remaining_amount);
      if (remaining > 0) {
        openCount.set(inv.customer_id, (openCount.get(inv.customer_id) || 0) + 1);
        if (inv.due_date && new Date(inv.due_date) < now) overdueBalance.add(inv.customer_id);
      }
      if (isToday(inv.created_at)) {
        todayTotal += toNumber(inv.total_amount);
        todayCount += 1;
      }
    }
    return { lastOrderByCustomer: lastOrder, openOrdersByCustomer: openCount, salesToday: todayTotal, ordersTodayFromInvoices: todayCount, overdueBalanceCustomerIds: overdueBalance };
  }, [invoices, customerIds]);

  const paymentsToday = useMemo(() => {
    let total = 0;
    for (const t of transactions) {
      if (!customerIds.has(t.customer_id)) continue;
      if (t.source_type !== "receipt") continue;
      if (!isToday(t.created_at)) continue;
      total += toNumber(t.credit) || toNumber(t.amount);
    }
    return total;
  }, [transactions, customerIds]);

  const dueTodayCustomers = useMemo(
    () => customers.filter((c) => coverage[c.id]?.overdue && c.id !== activeVisit?.customer_id)
      .sort((a, b) => (coverage[b.id]?.days_since_last_visit ?? 9999) - (coverage[a.id]?.days_since_last_visit ?? 9999)),
    [customers, coverage, activeVisit]
  );
  const completedTodayIds = useMemo(() => new Set(visits.filter((v) => isToday(v.visit_time)).map((v) => v.customer_id)), [visits]);
  const remainingToday = Math.max(0, dueTodayCustomers.length - completedTodayIds.size);

  const value = useMemo(() => ({
    // data
    customers, loadingCustomers, summary, coverage, visits, invoices, transactions, salesReps,
    refreshCustomers, refreshCoverage, refreshSummary, refreshVisits, refreshInvoices, refreshTransactions, refreshAll,
    // shared derivations
    customerIds, followupCustomerIds, lastOrderByCustomer, openOrdersByCustomer,
    salesToday, ordersTodayFromInvoices, overdueBalanceCustomerIds, paymentsToday,
    dueTodayCustomers, completedTodayIds, remainingToday,
    // command bar
    activeView, setActiveView,
    // active visit
    activeVisit, activeCustomer, elapsed, startingVisit, completingVisit,
    visitDraft, setVisitDraft, visitOrders, visitPayments,
    startVisit, completeVisit, recordVisitOrder, recordVisitPayment,
  }), [
    customers, loadingCustomers, summary, coverage, visits, invoices, transactions, salesReps,
    refreshCustomers, refreshCoverage, refreshSummary, refreshVisits, refreshInvoices, refreshTransactions, refreshAll,
    customerIds, followupCustomerIds, lastOrderByCustomer, openOrdersByCustomer,
    salesToday, ordersTodayFromInvoices, overdueBalanceCustomerIds, paymentsToday,
    dueTodayCustomers, completedTodayIds, remainingToday,
    activeView, activeVisit, activeCustomer, elapsed, startingVisit, completingVisit,
    visitDraft, visitOrders, visitPayments, startVisit, completeVisit, recordVisitOrder, recordVisitPayment,
  ]);

  return <FieldSalesCtx.Provider value={value}>{children}</FieldSalesCtx.Provider>;
}
