import logoFull from "../../assets/brand/vitalix-logo-full.png";
import logoIcon from "../../assets/brand/vitalix-logo-icon.png";

// Central VITALIX brand mark. Three variants cover every placement in the
// app (see Login, Sidebar) instead of copying <img>/shimmer markup per
// page. The moving-light overlay is a translated+skewed gradient band
// clipped by the wrapper's overflow:hidden - transform/opacity only, no
// animated blur/filter - see .brand-logo-shimmer in index.css, including
// the prefers-reduced-motion override that swaps it for a static glow.
const SHIMMER_SPEED = { full: "6.5s", compact: "10s", icon: "8s" };

export default function BrandLogo({ variant = "full", animated = true, size, className = "", subtitle = "ACCOUNTING", productLabel }) {
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

  // The compact (icon+text) composition below wraps this in its own
  // icon slot (.vitalix-brand-icon-slot, CSS-overridable so the mobile
  // media query can shrink it independently of the desktop size here) -
  // imageBox fills that slot at 100% rather than hardcoding a pixel value
  // itself, so the slot is the single source of truth for the icon's
  // rendered size; only its aspect-ratio:1/1 keeps it square. Sizing
  // imageBox off the outer `size` prop instead (the *composite* icon+text
  // row's total width, e.g. 208, meant for the flex container) previously
  // rendered the icon at full composite width with no overflow:hidden on
  // the icon slot to crop it, so it just overflowed to full size and
  // crowded out "VITALIX"/subtitle entirely.
  const COMPACT_ICON_SIZE = 54;
  const imageBoxSize = isCompact ? "100%" : size;

  const imageBox = (
    <span
      className={`brand-logo-wrap${isHero ? " brand-logo-wrap-hero" : ""}${animated ? " brand-logo-reveal" : ""}`}
      style={{
        display: "block",
        position: "relative",
        overflow: "hidden",
        borderRadius: isIconOnly || isCompact ? "22%" : "18px",
        width: imageBoxSize,
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
            // its card-icon composition; at icon/compact sidebar sizes that
            // padding eats into legibility, so zoom in uniformly (no
            // stretch, same aspect ratio) and let the wrapper's
            // overflow:hidden crop the excess evenly on every side.
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
    <span className={`brand-logo-hover ${className}`.trim()} style={{ display: "inline-flex", alignItems: "center", gap: 12, width: size }}>
      <span className="vitalix-brand-icon-slot" style={{ width: COMPACT_ICON_SIZE, flexShrink: 0 }}>{imageBox}</span>
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.15, minWidth: 0 }}>
        {/* overflow/textOverflow are a defensive fallback only - the
            composite's own "100%" width (see Sidebar.jsx) already sizes
            this to the sidebar's actual current width so it shouldn't
            normally need to truncate, but the sidebar is user-resizable
            down to 220px, where every character can't be guaranteed to
            fit at every font/label combination across fa/ar/tr/en. */}
        <span
          className="vitalix-brand-wordmark"
          style={{
            fontWeight: 900,
            fontSize: 20,
            letterSpacing: "0.02em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            background: "linear-gradient(110deg, var(--erp-accent), var(--erp-accent-2))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          VITALIX
        </span>
        <span
          className="vitalix-brand-subtitle"
          style={{
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.22em",
            color: "var(--erp-muted)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {subtitle}
        </span>
        {/* Optional 3rd, smallest, quietest line - a product-context label
            (e.g. "Accounting"), never rendered unless a caller explicitly
            opts in (Login's own compact usage doesn't pass this, so it's
            entirely unaffected). Lives in the same text column as
            VITALIX/subtitle so it shares their exact alignment/RTL
            positioning instead of being centered separately underneath. */}
        {productLabel && (
          <span
            className="vitalix-brand-product-context"
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--erp-muted)",
              opacity: 0.7,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginTop: 1,
            }}
          >
            {productLabel}
          </span>
        )}
      </span>
    </span>
  );
}
