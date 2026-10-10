import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "apps/control",
  plugins: [react()],
  build: { outDir: "../../dist/control", emptyOutDir: true },
});
