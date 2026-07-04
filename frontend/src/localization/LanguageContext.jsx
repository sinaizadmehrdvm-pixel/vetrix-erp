import {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
} from "react";

import { translations } from "./translations";
import { formatNumber, formatMoney, formatDate, formatTime } from "./helpers";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const savedLanguage = localStorage.getItem("vetrix_language") || "en";
  const [language, setLanguageState] = useState(savedLanguage);

  const dictionary = translations[language] || translations.en;
  const dir = dictionary.dir || "ltr";

  function setLanguage(nextLanguage) {
    localStorage.setItem("vetrix_language", nextLanguage);
    setLanguageState(nextLanguage);
  }

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
    document.body.dir = dir;
    document.body.style.direction = dir;
    document.body.classList.remove("rtl", "ltr");
    document.body.classList.add(dir);

    if (language === "fa") {
      document.body.style.fontFamily = "'Vazirmatn','IRANSans',Tahoma,sans-serif";
    } else {
      document.body.style.fontFamily = "'Inter','Segoe UI',Arial,sans-serif";
    }
  }, [language, dir]);

  const value = useMemo(() => {
    const translate = (key) => dictionary[key] || translations.en[key] || key;
    Object.assign(translate, dictionary);

    return {
      language,
      setLanguage,
      t: translate,
      dictionary,
      dir,
      locale: dictionary.locale || "en-US",
      isRTL: dir === "rtl",
      n: (value) => formatNumber(value, language),
      money: (value) => formatMoney(value, language),
      date: (value) => formatDate(value, language),
      time: (value) => formatTime(value, language),
      languages: Object.values(translations),
    };
  }, [language, dictionary, dir]);

  return (
    <LanguageContext.Provider value={value}>
      <div dir={value.dir} lang={language} className={value.dir} style={{ minHeight: "100vh", width: "100%" }}>
        {children}
      </div>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return context;
}
