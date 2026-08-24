// Shared status-tone -> token mapping, used by Badge (pill) and Notice
// (banner) so both surfaces always agree on color for a given tone.
export const TONE_STYLES = {
  success: { color: "var(--erp-success)", background: "var(--erp-success-soft)" },
  warning: { color: "var(--erp-warning)", background: "var(--erp-warning-soft)" },
  danger: { color: "var(--erp-danger)", background: "var(--erp-danger-soft)" },
  info: { color: "var(--erp-accent)", background: "var(--erp-glow)" },
  neutral: { color: "var(--erp-muted)", background: "var(--erp-panel-solid)" },
};
