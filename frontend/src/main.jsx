import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { LanguageProvider } from "./localization/LanguageProvider";
import { ThemeProvider } from "./theme/ThemeProvider";
import "@fontsource-variable/inter";
import "@fontsource-variable/estedad";
import "./index.css";
import "./styles/rtl.css";
import "./styles/fonts.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("Service worker registration failed:", error);
      });
    });
  } else {
    // A cache-first service worker actively fights the Vite dev server's
    // own HMR/caching, silently serving stale JS after every edit. Make
    // sure dev mode never has one active, including any leftover
    // registration from a previous production build served locally.
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    });
    if ("caches" in window) {
      caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
    }
  }
}