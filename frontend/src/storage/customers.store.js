import { getCache, setCache } from "./db";

const KEY = "customers";

export async function getCustomersOffline() {
  return (await getCache(KEY)) || [];
}

export async function saveCustomerOffline(customer) {
  const items = await getCustomersOffline();

  const newCustomer = {
    id: Date.now(),
    created_at: new Date().toISOString(),
    ...customer,
  };

  items.unshift(newCustomer);

  await setCache(KEY, items);

  return newCustomer;
}

export async function deleteCustomerOffline(id) {
  const items = await getCustomersOffline();

  const filtered = items.filter(
    (x) => Number(x.id) !== Number(id)
  );

  await setCache(KEY, filtered);

  return true;
}