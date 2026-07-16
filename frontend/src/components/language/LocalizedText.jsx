import { useLanguage } from "../../localization/useLanguage";

export default function LocalizedText({ id }) {
  const { t } = useLanguage();
  return <>{t[id] || id}</>;
}