import BrandLogo from "./BrandLogo";

// Signature branded loader (spec: "moving light around/through the logo,
// not a spinning logo"). Reuses BrandLogo's own shimmer for the light
// movement and adds only a slow pulsing ambient ring behind it - no
// separate animation system to keep in sync with the logo component.
export default function VitalixLoader({ variant = "page", label }) {
  const isPage = variant === "page";
  const size = isPage ? 96 : 36;

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
          <span aria-hidden="true" className="vitalix-loader-pulse" style={{ position: "absolute", inset: -size * 0.5 }} />
          <BrandLogo variant="icon" size={size} animated />
        </div>
        {label && (
          <span style={{ color: "var(--erp-muted)", fontSize: isPage ? 14 : 12, fontWeight: 700 }}>{label}</span>
        )}
      </div>
    </div>
  );
}
