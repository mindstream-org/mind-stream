import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      ignored: [
        '**/node_modules/**',
        '**/backend/venv/**',
        '**/backend/output/**',
        '**/backend/__pycache__/**',
        '**/.git/**',
      ],
    },
  },
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
