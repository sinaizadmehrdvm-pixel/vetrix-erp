import {
  useMemo,
  useState,
  useEffect,
  useCallback,
} from "react";
import { LanguageContext } from "./languageContext";

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

export function LanguageProvider({ children }) {
  const savedLanguage = localStorage.getItem("vetrix_language") || "en";
  const [language, setLanguageState] = useState(savedLanguage);
  const savedCountry = localStorage.getItem("vetrix_country") || DEFAULT_COUNTRY;
  const [country, setCountryState] = useState(savedCountry);
  const [companyFormatting, setCompanyFormattingState] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("vetrix_company_formatting") || "{}");
    } catch {
      return {};
    }
  });
  const profile = useMemo(() => {
    const baseProfile = getCountryProfile(country);
    return {
      ...baseProfile,
      currency: companyFormatting.currency_code || baseProfile.currency,
      currencyDigits: Number.isInteger(companyFormatting.decimal_places)
        ? companyFormatting.decimal_places
        : baseProfile.currencyDigits,
      calendar: companyFormatting.calendar_system || baseProfile.calendar,
      timeZone: companyFormatting.time_zone || baseProfile.timeZone,
      firstDayOfWeek: Number.isInteger(companyFormatting.first_day_of_week)
        ? companyFormatting.first_day_of_week
        : baseProfile.firstDayOfWeek,
      measurementSystem: companyFormatting.measurement_system || baseProfile.measurementSystem,
      fiscalYearStart: companyFormatting.fiscal_year_start || baseProfile.fiscalYearStart,
    };
  }, [country, companyFormatting]);

  const dictionary = translations[language] || translations.en;
  const dir = dictionary.dir || "ltr";

  const setLanguage = useCallback((nextLanguage) => {
    localStorage.setItem("vetrix_language", nextLanguage);
    setLanguageState(nextLanguage);
  }, []);

  const setCountry = useCallback((nextCountry) => {
    const normalized = COUNTRY_PROFILES[nextCountry] ? nextCountry : DEFAULT_COUNTRY;
    localStorage.setItem("vetrix_country", normalized);
    setCountryState(normalized);
  }, []);

  const setCompanyFormatting = useCallback((settings = {}) => {
    const safe = {
      currency_code: String(settings.currency_code || ""),
      decimal_places: Number.isInteger(Number(settings.decimal_places))
        ? Math.max(0, Math.min(4, Number(settings.decimal_places)))
        : undefined,
      calendar_system: String(settings.calendar_system || ""),
      time_zone: String(settings.time_zone || ""),
      first_day_of_week: Number.isInteger(Number(settings.first_day_of_week))
        ? Math.max(0, Math.min(6, Number(settings.first_day_of_week)))
        : undefined,
      measurement_system: String(settings.measurement_system || ""),
      fiscal_year_start: String(settings.fiscal_year_start || ""),
      rounding_mode: String(settings.rounding_mode || "half_up"),
    };
    localStorage.setItem("vetrix_company_formatting", JSON.stringify(safe));
    setCompanyFormattingState(safe);
  }, []);

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
      setCompanyFormatting,
      companyFormatting,
      countryProfile: profile,
      countries: Object.values(COUNTRY_PROFILES),
      currency: profile.currency,
      calendar: profile.calendar,
      timeZone: profile.timeZone,
      measurementSystem: profile.measurementSystem,
      roundingMode: companyFormatting.rounding_mode || "half_up",
      decimalPlaces: profile.currencyDigits,
      n: (value, options) => formatCountryNumber(value, profile, language, options),
      money: (value, currencyOverride) => formatCountryMoney(value, profile, language, currencyOverride),
      date: (value, options) => formatCountryDate(value, profile, language, options),
      time: (value) => formatCountryTime(value, profile, language),
      languages: Object.values(translations),
    };
  }, [language, dictionary, dir, country, companyFormatting, profile, setLanguage, setCountry, setCompanyFormatting]);

  return (
    <LanguageContext.Provider value={value}>
      <div dir={value.dir} lang={language} className={value.dir} style={{ minHeight: "100vh", width: "100%" }}>
        {children}
      </div>
    </LanguageContext.Provider>
  );
}

