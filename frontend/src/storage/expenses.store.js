import { getCache, setCache } from "./db";

const KEY = "expenses";

export async function getExpensesOffline() {
  return (await getCache(KEY)) || [];
}

export async function saveExpenseOffline(expense) {
  const items = await getExpensesOffline();

  const newExpense = {
    id: Date.now(),
    created_at: new Date().toISOString(),
    ...expense,
  };

  items.unshift(newExpense);

  await setCache(KEY, items);

  return newExpense;
}

export async function deleteExpenseOffline(id) {
  const items = await getExpensesOffline();

  const filtered = items.filter(
    (x) => Number(x.id) !== Number(id)
  );

  await setCache(KEY, filtered);

  return true;
}