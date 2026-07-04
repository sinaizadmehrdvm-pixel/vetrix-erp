export const calcProfit = (data) => {
  const sales = data.total_sales || 0;
  const purchases = data.total_purchases || 0;
  const expenses = data.total_expenses || 0;

  const grossProfit = sales - purchases;
  const netProfit = grossProfit - expenses;

  return {
    grossProfit,
    netProfit,
  };
};