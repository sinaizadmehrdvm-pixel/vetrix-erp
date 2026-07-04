import { useEffect, useState } from "react";
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

  useEffect(() => {
    load();
  }, []);

  return {
    templates,
    activeTemplate,
    setActiveTemplate,
    reloadTemplates: load,
  };
}