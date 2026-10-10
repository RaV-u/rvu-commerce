import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { Services } from "./Services.tsx";
import "./style.css";
import "./services.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname === "/services" ? <Services /> : <App />}
  </React.StrictMode>,
);
