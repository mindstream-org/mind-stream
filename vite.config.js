import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        side_panel: "index.html",
        background: "src/background/index.js",
        capture: "src/capture/capture.html",
      },
      output: {
        entryFileNames: "[name].js",
      },
    },
  },
});
