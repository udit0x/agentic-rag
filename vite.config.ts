import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";
import postcssImport from "postcss-import";
import svgr from "vite-plugin-svgr";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables for proxy configuration
const pythonApiUrl = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
const expressApiUrl = process.env.EXPRESS_BACKEND_URL || "http://localhost:5000";

export default defineConfig({
  plugins: [react(), svgr()],
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
      // Route health check to Python FastAPI directly
      "/api/health": {
        target: pythonApiUrl,
        changeOrigin: true,
        secure: false,
      },
      // Route specific endpoints to Python FastAPI
      "/api/query": {
        target: pythonApiUrl,
        changeOrigin: true,
        secure: false,
      },
      "/api/config": {
        target: pythonApiUrl,
        changeOrigin: true,
        secure: false,
      },
      "/api/chat": {
        target: pythonApiUrl,
        changeOrigin: true,
        secure: false,
      },
      // Route document and storage endpoints to TypeScript Express
      "/api/documents": {
        target: expressApiUrl,
        changeOrigin: true,
        secure: false,
      },
      "/api/analytics": {
        target: expressApiUrl,
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
