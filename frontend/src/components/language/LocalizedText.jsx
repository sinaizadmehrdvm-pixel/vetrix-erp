import { useLanguage } from "../../localization/LanguageContext";

export default function LocalizedText({ id }) {
  const { t } = useLanguage();
  return <>{t[id] || id}</>;
}