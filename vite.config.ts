import path from "node:path";
import tailwindcss from "@tailwindcss/postcss";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

/** Enables SharedArrayBuffer (workers + zero-copy sim buffer). */
const crossOriginIsolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  // credentialless: SAB without blocking cross-origin fonts/assets (require-corp breaks Google Fonts).
  "Cross-Origin-Embedder-Policy": "credentialless",
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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "three";
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ["@dimforge/rapier3d-compat"],
  },
});
