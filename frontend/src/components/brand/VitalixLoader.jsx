import BrandLogo from "./BrandLogo";
import { useLanguage } from "../../localization/useLanguage";

// Signature branded loader (spec: "moving light around/through the logo,
// not a spinning logo"). Reuses BrandLogo's own shimmer for the light
// movement; the ambient ring behind it is dual-tone (cyan primary, a
// fainter gold ring slightly out of phase) so the loading moment reads as
// the same cyan-to-gold brand-light system, not a generic single-color
// spinner glow. `progress` (0-100) renders a real determinate ring instead
// of the ambient pulse when the caller has actual progress to show.
export default function VitalixLoader({ variant = "page", label, progress }) {
  const { n } = useLanguage();
  const isPage = variant === "page";
  const size = isPage ? 96 : 36;
  const hasProgress = typeof progress === "number" && Number.isFinite(progress);

  return (
    <div
      style={
        isPage
          ? { height: "100vh", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--erp-bg)" }
          : { display: "inline-flex", alignItems: "center", gap: 10 }
      }
    >
      <div style={{ display: "flex", flexDirection: isPage ? "column" : "row", alignItems: "center", gap: isPage ? 16 : 10 }}>
        <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {hasProgress ? (
            <svg width={size * 1.6} height={size * 1.6} style={{ position: "absolute", inset: -size * 0.3, transform: "rotate(-90deg)" }} aria-hidden="true">
              <circle cx="50%" cy="50%" r={size * 0.72} fill="none" stroke="var(--erp-border)" strokeWidth={3} />
              <circle
                cx="50%"
                cy="50%"
                r={size * 0.72}
                fill="none"
                stroke="var(--erp-accent)"
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * (size * 0.72)}
                strokeDashoffset={2 * Math.PI * (size * 0.72) * (1 - Math.min(100, Math.max(0, progress)) / 100)}
                style={{ transition: "stroke-dashoffset .3s var(--erp-ease)" }}
              />
            </svg>
          ) : (
            <>
              <span aria-hidden="true" className="vitalix-loader-pulse" style={{ position: "absolute", inset: -size * 0.5 }} />
              <span
                aria-hidden="true"
                className="vitalix-loader-pulse vitalix-loader-pulse-gold"
                style={{ position: "absolute", inset: -size * 0.35 }}
              />
            </>
          )}
          <BrandLogo variant="icon" size={size} animated />
        </div>
        {label && (
          <span style={{ color: "var(--erp-muted)", fontSize: isPage ? 14 : 12, fontWeight: 700 }}>
            {label}
            {hasProgress ? ` ${n(Math.round(Math.min(100, Math.max(0, progress))))}%` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
