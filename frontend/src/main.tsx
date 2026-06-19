import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// Fade out the first-paint splash (index.html) once the app has mounted. We
// hold it briefly so the logo animation registers instead of flashing past,
// then remove the node entirely so it never traps focus or pointer events.
{
  const splash = document.getElementById("app-splash");
  if (splash) {
    const hide = () => {
      splash.classList.add("app-splash-hide");
      splash.addEventListener("transitionend", () => splash.remove(), { once: true });
      // Fallback in case the transition never fires (e.g. reduced motion).
      setTimeout(() => splash.remove(), 700);
    };
    setTimeout(hide, 900);
  }
}

// Cache the app shell so the Emergency contacts page works with no signal.
// Production only, a SW caching dev-server modules is pure confusion.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => { /* offline support is progressive enhancement */ });
  });
}
