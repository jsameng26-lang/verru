import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { COMPANY } from "../company.config";
import "./globals.css";
import "./office.css";

document.title = COMPANY.pageTitle;
const meta = document.createElement("meta");
meta.name = "description";
meta.content = COMPANY.description;
document.head.appendChild(meta);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
