import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { useLanguage } from "../localization/LanguageContext";

export default function MainLayout() {
  const { dir } = useLanguage();

  return (
    <div
      className="erp-layout"
      dir={dir}
      style={{
        display: "flex",
        minHeight: "100vh",
        height: "100vh",
        background: "var(--erp-bg)",
        color: "white",
        overflow: "hidden",
      }}
    >
      <Sidebar />

      <main
        className="erp-main"
        style={{
          flex: 1,
          minWidth: 0,
          height: "100vh",
          padding: "clamp(14px, 2vw, 30px)",
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}