import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Polyfill process.env for the browser to prevent crashes if libraries check for it
if (typeof window !== "undefined" && !window.process) {
  (window as any).process = { env: {} };
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
