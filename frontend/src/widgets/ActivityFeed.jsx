export default function ActivityFeed({ items = [] }) {
  return (
    <div className="glass-card">
      <h2 className="panel-title">Activity Feed</h2>

      {items.map((item, index) => (
        <div key={index} className="activity-row">
          <strong>{item.title}</strong>
          <span>{item.time}</span>
        </div>
      ))}
    </div>
  );
}