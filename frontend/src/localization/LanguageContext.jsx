import {
  createContext,
  useContext,
  useMemo,
  useState,
  useEffect,
} from "react";

import { translations } from "./translations";
import {
  COUNTRY_PROFILES,
  DEFAULT_COUNTRY,
  formatCountryDate,
  formatCountryMoney,
  formatCountryNumber,
  formatCountryTime,
  getCountryProfile,
  localeFor,
} from "./countryProfiles";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const savedLanguage = localStorage.getItem("vetrix_language") || "en";
  const [language, setLanguageState] = useState(savedLanguage);
  const savedCountry = localStorage.getItem("vetrix_country") || DEFAULT_COUNTRY;
  const [country, setCountryState] = useState(savedCountry);
  const profile = getCountryProfile(country);

  const dictionary = translations[language] || translations.en;
  const dir = dictionary.dir || "ltr";

  function setLanguage(nextLanguage) {
    localStorage.setItem("vetrix_language", nextLanguage);
    setLanguageState(nextLanguage);
  }

  function setCountry(nextCountry) {
    const normalized = COUNTRY_PROFILES[nextCountry] ? nextCountry : DEFAULT_COUNTRY;
    localStorage.setItem("vetrix_country", normalized);
    setCountryState(normalized);
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
      locale: localeFor(profile, language),
      isRTL: dir === "rtl",
      country,
      setCountry,
      countryProfile: profile,
      countries: Object.values(COUNTRY_PROFILES),
      currency: profile.currency,
      calendar: profile.calendar,
      timeZone: profile.timeZone,
      measurementSystem: profile.measurementSystem,
      n: (value, options) => formatCountryNumber(value, profile, language, options),
      money: (value, currencyOverride) => formatCountryMoney(value, profile, language, currencyOverride),
      date: (value, options) => formatCountryDate(value, profile, language, options),
      time: (value) => formatCountryTime(value, profile, language),
      languages: Object.values(translations),
    };
  }, [language, dictionary, dir, country, profile]);

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
