import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";
import { useLanguage } from "../../localization/useLanguage";
import { registerDialogDispatch } from "./confirmService";

// Shared replacement for the browser's native dialog trio (VITALIX audit
// BLOCKER - they can't be themed/RTL'd/reduced-motion'd and block the
// whole tab). Mount once as <ConfirmDialogHost/> in App.jsx,
// exactly like react-hot-toast's <Toaster/> - callers anywhere just
// `await confirmAction(message)` / `await promptAction(message)` (from
// confirmService.js) without rendering their own Modal/state.
export function ConfirmDialogHost() {
  const { language, dir } = useLanguage();
  const [state, setState] = useState(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    registerDialogDispatch((next) => {
      setState(next);
      setValue(next.opts.defaultValue || "");
      setOpen(true);
    });
    return () => registerDialogDispatch(null);
  }, []);

  function settle(result) {
    state?.resolve(result);
    // `state` is deliberately kept (not nulled) so Modal's exit animation
    // has content to fade out instead of going blank mid-transition - see
    // Modal.jsx, which must stay mounted with `open` toggling rather than
    // being conditionally rendered by its parent for that animation to run
    // at all (DESIGN_SYSTEM.md §3's "Modal correctness" rule).
    setOpen(false);
  }

  const isPrompt = state?.kind === "prompt";
  const danger = Boolean(state?.opts?.danger);

  return (
    <Modal
      open={open}
      onClose={() => settle(isPrompt ? null : false)}
      maxWidthClassName="max-w-sm"
      labelledBy="vitalix-confirm-title"
    >
      {state && (
        <div dir={dir} className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            {danger && (
              <span className="shrink-0 inline-flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: "var(--erp-radius-sm)", background: "var(--erp-danger-soft)", color: "var(--erp-danger)" }}>
                <AlertTriangle size={17} />
              </span>
            )}
            <p id="vitalix-confirm-title" style={{ color: "var(--erp-text)", fontWeight: 700, margin: 0 }}>{state.message}</p>
          </div>
          {isPrompt && (
            <input
              autoFocus
              aria-labelledby="vitalix-confirm-title"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") settle(value); }}
              className="erp-focus w-full"
              style={{ borderRadius: "var(--erp-radius-sm)", border: "1px solid var(--erp-border)", padding: "10px 12px", background: "var(--erp-panel-solid)", color: "var(--erp-text)" }}
            />
          )}
          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => settle(isPrompt ? null : false)}>
              {language === "fa" ? "انصراف" : language === "ar" ? "إلغاء" : language === "tr" ? "İptal" : "Cancel"}
            </Button>
            <Button variant={danger ? "danger" : "primary"} onClick={() => settle(isPrompt ? value : true)}>
              {language === "fa" ? "تأیید" : language === "ar" ? "تأكيد" : language === "tr" ? "Onayla" : "Confirm"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
