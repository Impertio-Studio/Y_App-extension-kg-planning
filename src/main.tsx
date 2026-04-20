import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./i18n";
import "./index.css";
import KgPlanningPage from "./Page";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<KgPlanningPage />} />
        <Route path="/:tab" element={<KgPlanningPage />} />
        <Route path="*" element={<KgPlanningPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
