import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import postcssImport from "postcss-import";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      // Route specific endpoints to Python FastAPI
      "/api/query": {
        target: "http://localhost:8000",
        changeOrigin: true,
        secure: false,
      },
      "/api/config": {
        target: "http://localhost:8000",
        changeOrigin: true,
        secure: false,
      },
      "/api/chat": {
        target: "http://localhost:8000",
        changeOrigin: true,
        secure: false,
      },
      // Route document and storage endpoints to TypeScript Express
      "/api/documents": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
      "/api/health": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
      "/api/analytics": {
        target: "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  css: {
    devSourcemap: false,
    postcss: {
      from: undefined,
      plugins: [postcssImport(), tailwindcss, autoprefixer],
    },
  },
});
