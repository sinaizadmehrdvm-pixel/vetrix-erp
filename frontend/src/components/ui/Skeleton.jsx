// Shimmer placeholder for tables/cards/charts while data loads - replaces
// blank boxes or a lone spinner with a shape that previews the real
// layout. Pure CSS shimmer (background-position keyframe), see
// .erp-skeleton in index.css including the reduced-motion fallback.
export default function Skeleton({ width = "100%", height = 16, radius, className = "", style }) {
  return (
    <div
      className={["erp-skeleton", className].join(" ")}
      style={{ width, height, borderRadius: radius ?? "var(--erp-radius-sm)", ...style }}
      aria-hidden="true"
    />
  );
}

export function SkeletonRows({ rows = 4, height = 16, gap = 10 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} height={height} width={index === rows - 1 ? "60%" : "100%"} />
      ))}
    </div>
  );
}
