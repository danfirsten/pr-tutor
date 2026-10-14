import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "web",
  plugins: [react()],
  build: { outDir: "../dist/web", emptyOutDir: true },
  test: { root: ".", include: ["server/**/*.test.ts", "web/src/**/*.test.ts"] },
});
