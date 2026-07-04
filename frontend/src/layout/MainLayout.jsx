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
        background: "#071028",
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
          padding: 30,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}