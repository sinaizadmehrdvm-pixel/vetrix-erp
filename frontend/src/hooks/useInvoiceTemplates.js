import { useEffect, useState } from "react";
import { useStableCallback } from "./useStableCallback";
import { getPdfTemplates } from "../services/api";

export function useInvoiceTemplates() {
  const [templates, setTemplates] = useState([]);
  const [activeTemplate, setActiveTemplate] = useState(null);

  async function load() {
    try {
      const data = await getPdfTemplates();
      setTemplates(Array.isArray(data) ? data : []);

      // default select first
      if (data?.length && !activeTemplate) {
        setActiveTemplate(data[0]);
      }
    } catch (e) {
      console.error("Template load error:", e);
    }
  }

  const stableLoad = useStableCallback(load);

  useEffect(() => {
    const timer = setTimeout(() => { void stableLoad(); }, 0);
    return () => clearTimeout(timer);
  }, [stableLoad]);

  return {
    templates,
    activeTemplate,
    setActiveTemplate,
    reloadTemplates: load,
  };
}
