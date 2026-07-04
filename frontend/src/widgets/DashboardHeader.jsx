import RealtimeClock from "./RealtimeClock";
import SmartSearch from "./SmartSearch";

export default function DashboardHeader({ search, setSearch }) {
  return (
    <div className="dashboard-header">
      <div>
        <h1>Vetrix ERP Dashboard</h1>
        <p>Real-time accounting, inventory and financial intelligence</p>
      </div>

      <div className="header-tools">
        <SmartSearch value={search} onChange={setSearch} />
        <RealtimeClock />
      </div>
    </div>
  );
}