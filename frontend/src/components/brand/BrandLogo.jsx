import logoFull from "../../assets/brand/vitalix-logo-full.png";
import logoIcon from "../../assets/brand/vitalix-logo-icon.png";

// Central VITALIX brand mark. Three variants cover every placement in the
// app (see Login, Sidebar) instead of copying <img>/shimmer markup per
// page. The moving-light overlay is a translated+skewed gradient band
// clipped by the wrapper's overflow:hidden - transform/opacity only, no
// animated blur/filter - see .brand-logo-shimmer in index.css, including
// the prefers-reduced-motion override that swaps it for a static glow.
const SHIMMER_SPEED = { full: "6.5s", compact: "10s", icon: "8s" };

export default function BrandLogo({ variant = "full", animated = true, size, className = "" }) {
  const isIconOnly = variant === "icon";
  const isCompact = variant === "compact";
  const src = isIconOnly ? logoIcon : isCompact ? logoIcon : logoFull;
  const alt = "VITALIX ACCOUNTING";

  // Hero placement only (Login) - the source PNG is a square, opaque-
  // background asset, which reads as "an image pasted in a box" at large
  // hero sizes. A radial mask dissolves that square edge into the page
  // instead of cutting it off hard - icon/compact stay full-bleed since
  // they're small enough that legibility matters more than atmosphere.
  const isHero = !isIconOnly && !isCompact;

  const imageBox = (
    <span
      className={`brand-logo-wrap${isHero ? " brand-logo-wrap-hero" : ""}${animated ? " brand-logo-reveal" : ""}`}
      style={{
        display: "block",
        position: "relative",
        overflow: "hidden",
        borderRadius: isIconOnly || isCompact ? "22%" : "18px",
        width: size,
        aspectRatio: isIconOnly || isCompact ? "1 / 1" : undefined,
        lineHeight: 0,
      }}
    >
      <img
        src={src}
        alt={alt}
        style={
          isIconOnly || isCompact
            // Source art keeps deliberate breathing room around the mark for
            // its card-icon composition; at 40px (sidebar) that padding
            // eats into legibility, so zoom in uniformly (no stretch, same
            // aspect ratio) and let the wrapper's overflow:hidden crop the
            // excess evenly on every side.
            ? { display: "block", width: "100%", height: "100%", objectFit: "cover", transform: "scale(1.18)" }
            : { display: "block", width: "100%", height: "auto" }
        }
        draggable={false}
      />
      {animated && (
        <span
          aria-hidden="true"
          className="brand-logo-shimmer"
          style={{ animationDuration: SHIMMER_SPEED[isCompact ? "compact" : isIconOnly ? "icon" : "full"] }}
        />
      )}
    </span>
  );

  if (!isCompact) {
    return (
      <span className={`brand-logo-hover ${className}`.trim()} style={{ display: "inline-block", position: "relative", width: size }}>
        {/* Idle ambient aura - full variant only (Login hero). Restrained
            enough at icon/compact sizes to skip; a blurred aura behind a
            40px sidebar mark would read as noise, not "alive". */}
        {!isIconOnly && animated && <span aria-hidden="true" className="brand-logo-ambient" />}
        {imageBox}
      </span>
    );
  }

  return (
    <span className={`brand-logo-hover ${className}`.trim()} style={{ display: "inline-flex", alignItems: "center", gap: 10, width: size }}>
      <span style={{ width: 40, flexShrink: 0 }}>{imageBox}</span>
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.15, minWidth: 0 }}>
        <span
          style={{
            fontWeight: 900,
            fontSize: 19,
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
            background: "linear-gradient(110deg, var(--erp-accent), var(--erp-accent-2))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          VITALIX
        </span>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.22em", color: "var(--erp-muted)", whiteSpace: "nowrap" }}>
          ACCOUNTING
        </span>
      </span>
    </span>
  );
}
