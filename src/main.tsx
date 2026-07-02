import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { initTts } from "./lib/tts";
import { registerSW } from "virtual:pwa-register";

initTts();
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
