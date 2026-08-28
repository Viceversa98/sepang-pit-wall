import path from "node:path";
import tailwindcss from "@tailwindcss/postcss";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const crossOriginIsolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [svelte()],
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    headers: crossOriginIsolationHeaders,
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
  worker: {
    format: "es",
  },
  optimizeDeps: {
    exclude: ["@dimforge/rapier3d-compat"],
  },
});
