export default function LiveNotification({ notifications = [] }) {
  return (
    <div className="glass-card">
      <h2 className="panel-title">Live Notifications</h2>

      {notifications.map((item, index) => (
        <div key={index} className={`notification ${item.type}`}>
          <strong>{item.title}</strong>
          <span>{item.message}</span>
        </div>
      ))}
    </div>
  );
}