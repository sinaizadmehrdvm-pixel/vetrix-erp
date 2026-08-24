import { forwardRef } from "react";

// Shared control chrome (border/radius/padding/focus ring) - the app's
// global CSS already sets color/background/border-color on bare
// input/select/textarea (see index.css), but not width, radius or padding,
// since Tailwind's preflight zeroes border-width by default. Centralizing
// that here replaces the `inputClass` string / `input` style-object each
// page redefined for itself.
const CONTROL_CLASSES =
  "vitalix-control-inset w-full border " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

const CONTROL_STYLE = {
  borderRadius: "var(--erp-radius-sm)",
  borderColor: "var(--erp-border)",
  padding: "10px 12px",
  fontSize: 14,
};

// Single-line controls match Button's 44px height exactly ("identical
// geometry" across the app); Textarea stays multi-line height (its own
// global min-height rule in index.css already handles that) so it isn't
// forced down to a one-line box.
const SINGLE_LINE_STYLE = { ...CONTROL_STYLE, minHeight: 44 };

export const Input = forwardRef(function Input({ className = "", style, error, ...rest }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={error || undefined}
      className={[CONTROL_CLASSES, error ? "vitalix-control-error" : "", className].join(" ")}
      style={{ ...SINGLE_LINE_STYLE, ...style }}
      {...rest}
    />
  );
});

export const Select = forwardRef(function Select({ className = "", style, error, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      aria-invalid={error || undefined}
      className={[CONTROL_CLASSES, error ? "vitalix-control-error" : "", className].join(" ")}
      style={{ ...SINGLE_LINE_STYLE, ...style }}
      {...rest}
    >
      {children}
    </select>
  );
});

export const Textarea = forwardRef(function Textarea({ className = "", style, error, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={error || undefined}
      className={[CONTROL_CLASSES, error ? "vitalix-control-error" : "", className].join(" ")}
      style={{ ...CONTROL_STYLE, ...style }}
      {...rest}
    />
  );
});

export default function Field({
  label,
  hint,
  error,
  required = false,
  htmlFor,
  className = "",
  children,
}) {
  return (
    <div className={["flex flex-col gap-1.5", className].join(" ")}>
      {label ? (
        <label
          htmlFor={htmlFor}
          style={{ fontSize: 13, fontWeight: 700, color: "var(--erp-text)" }}
        >
          {label}
          {required ? (
            <span style={{ color: "var(--erp-danger)" }}> *</span>
          ) : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--erp-danger)" }}>
          {error}
        </span>
      ) : hint ? (
        <span style={{ fontSize: 12, color: "var(--erp-muted)" }}>{hint}</span>
      ) : null}
    </div>
  );
}
