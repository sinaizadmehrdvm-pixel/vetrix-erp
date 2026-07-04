export const toPersianNumber = (n) => {
  if (n === null || n === undefined) return "";
  return n.toString().replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
};

export const formatMoney = (value) => {
  if (!value && value !== 0) return "۰";
  return (
    toPersianNumber(
      new Intl.NumberFormat("en-US").format(value)
    ) + " تومان"
  );
};