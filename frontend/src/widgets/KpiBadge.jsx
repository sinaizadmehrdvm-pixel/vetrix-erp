export default function KpiBadge({ label, value, color = "#22d3ee" }) {
  return (
    <div style={{
      padding: "10px 14px",
      borderRadius: 14,
      background: `${color}22`,
      border: `1px solid ${color}66`,
      color,
      fontWeight: 800,
      display: "inline-flex",
      gap: 8,
      alignItems: "center",
    }}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}