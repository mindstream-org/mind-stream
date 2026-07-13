import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../style.css";
import CaptureWindow from "./CaptureWindow.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <CaptureWindow />
  </StrictMode>,
);
