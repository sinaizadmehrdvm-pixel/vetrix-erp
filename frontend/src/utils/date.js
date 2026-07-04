import moment from "moment-jalaali";

moment.loadPersian({ dialect: "persian-modern" });

export const toJalali = (date) => {
  if (!date) return "";
  return moment(date).format("jYYYY/jMM/jDD");
};

export const todayJalali = () => {
  return moment().format("jYYYY/jMM/jDD");
};