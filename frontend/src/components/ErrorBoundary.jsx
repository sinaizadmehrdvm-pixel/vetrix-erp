import { Component } from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Vetrix UI boundary", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const fa = document.documentElement.lang === "fa";
    return (
      <div dir={fa ? "rtl" : "ltr"} style={{ minHeight: "100vh", background: "#071028", color: "#f8fafc", display: "grid", placeItems: "center", padding: 24 }}>
        <section style={{ width: "min(620px,100%)", padding: 28, borderRadius: 26, background: "linear-gradient(145deg,#0f172a,#111c36)", border: "1px solid rgba(248,113,113,.35)", boxShadow: "0 30px 90px rgba(0,0,0,.4)" }}>
          <AlertTriangle size={42} color="#f87171" />
          <h1 style={{ color: "#fecaca" }}>{fa ? "خطای غیرمنتظره رابط کاربری" : "Unexpected interface error"}</h1>
          <p style={{ color: "#94a3b8", lineHeight: 1.8 }}>{fa ? "اطلاعات شما حذف نشده است. صفحه را دوباره بارگذاری کنید؛ اگر خطا تکرار شد، گزارش سلامت سیستم را بررسی کنید." : "Your data was not deleted. Reload the page; if the error returns, review System Health."}</p>
          <pre style={{ padding: 12, borderRadius: 12, overflow: "auto", background: "#020617", color: "#fca5a5", fontSize: 12 }}>{this.state.error?.message || "Unknown error"}</pre>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 18 }}>
            <button onClick={() => window.location.reload()} style={{ border: 0, borderRadius: 12, padding: "11px 15px", background: "#0e7490", color: "white", fontWeight: 900, cursor: "pointer", display: "flex", gap: 7 }}><RefreshCw size={17} />{fa ? "بارگذاری مجدد" : "Reload"}</button>
            <button onClick={() => { window.location.href = "/"; }} style={{ border: 0, borderRadius: 12, padding: "11px 15px", background: "#166534", color: "white", fontWeight: 900, cursor: "pointer", display: "flex", gap: 7 }}><Home size={17} />{fa ? "داشبورد" : "Dashboard"}</button>
          </div>
        </section>
      </div>
    );
  }
}
