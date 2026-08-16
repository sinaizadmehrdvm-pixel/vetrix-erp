import { forwardRef } from "react";
import { Loader2 } from "lucide-react";

// The app-wide height/font-weight/radius for buttons is already enforced
// globally by `.erp-main :where(button, [role="button"])` in index.css
// (added earlier to stop every page hand-styling its own button size) -
// the "default" size here relies on that instead of re-declaring it, so
// this component and the ~50 not-yet-migrated pages stay visually
// identical for the common case. Only "sm" and icon-only sizes need to
// fight that rule, via Tailwind's `!` important modifier.
const VARIANT_CLASSES = {
  primary:
    "vitalix-btn-sweep bg-[var(--erp-accent)] text-[#04121b] hover:brightness-110 active:brightness-95",
  secondary:
    "bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] border border-[var(--erp-border)] hover:bg-[var(--erp-glow)]",
  ghost:
    "bg-transparent text-[var(--erp-text)] hover:bg-[var(--erp-glow)]",
  danger:
    "bg-[var(--erp-danger-soft)] text-[var(--erp-danger)] hover:brightness-110",
  success:
    "bg-[var(--erp-success-soft)] text-[var(--erp-success)] hover:brightness-110",
  accent:
    "vitalix-btn-sweep text-[#04121b] hover:brightness-110 active:brightness-95",
};

const VARIANT_STYLE = {
  accent: { background: "linear-gradient(110deg, var(--erp-accent), var(--erp-accent-2))" },
};

const SIZE_CLASSES = {
  default: "px-4 gap-2",
  sm: "!h-9 !min-h-9 !text-[13px] px-3 gap-1.5",
};

const Button = forwardRef(function Button(
  {
    variant = "primary",
    size = "default",
    loading = false,
    disabled = false,
    icon: Icon,
    iconPosition = "start",
    className = "",
    style,
    type = "button",
    children,
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading;
  const iconEl = loading ? (
    <Loader2 size={16} className="animate-spin shrink-0" />
  ) : Icon ? (
    <Icon size={16} className="shrink-0" />
  ) : null;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        "relative inline-flex items-center justify-center whitespace-nowrap overflow-hidden",
        "transition-[filter,background-color,opacity] duration-150",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      ].join(" ")}
      style={{ borderRadius: "var(--erp-radius-md)", minHeight: size === "sm" ? undefined : 44, ...VARIANT_STYLE[variant], ...style }}
      {...rest}
    >
      {iconEl && iconPosition === "start" ? iconEl : null}
      {children}
      {iconEl && iconPosition === "end" ? iconEl : null}
    </button>
  );
});

export default Button;
