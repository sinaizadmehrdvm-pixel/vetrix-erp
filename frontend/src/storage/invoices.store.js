import { getCache, setCache } from "./db";

const KEY = "invoices";

export async function getInvoicesOffline() {
  return (await getCache(KEY)) || [];
}

export async function saveInvoiceOffline(invoice) {
  const items = await getInvoicesOffline();

  const newInvoice = {
    id: Date.now(),
    created_at: new Date().toISOString(),
    status: "draft",
    ...invoice,
  };

  items.unshift(newInvoice);

  await setCache(KEY, items);

  return newInvoice;
}

export async function deleteInvoiceOffline(id) {
  const items = await getInvoicesOffline();

  const filtered = items.filter(
    (x) => Number(x.id) !== Number(id)
  );

  await setCache(KEY, filtered);

  return true;
}

export async function getInvoiceByIdOffline(id) {
  const items = await getInvoicesOffline();

  return (
    items.find((x) => Number(x.id) === Number(id)) ||
    null
  );
}