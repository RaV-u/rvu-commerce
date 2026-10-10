import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./style.css";
import "./services.css";

// Old bookmarks now resolve to the same storefront; no second React page.
if (window.location.pathname === "/services") {
  window.history.replaceState(null, "", "/");
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
