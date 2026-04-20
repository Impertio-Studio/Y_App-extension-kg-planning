import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? "/Y_App-extension-kg-planning/",
  server: { port: 5174 },
});
