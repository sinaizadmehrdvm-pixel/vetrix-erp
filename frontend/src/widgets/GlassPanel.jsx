export default function GlassPanel({ title, children }) {
  return (
    <div className="glass-card glass-panel">
      {title && <h2 className="panel-title">{title}</h2>}
      {children}
    </div>
  );
}