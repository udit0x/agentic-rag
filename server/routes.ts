import type { Express } from "express";
import { createServer, type Server } from "http";
import { createProxyMiddleware } from "http-proxy-middleware";

export async function registerRoutes(app: Express): Promise<Server> {
  // Proxy all /api requests to FastAPI backend
  app.use(
    "/api",
    createProxyMiddleware({
      target: "http://localhost:8000",
      changeOrigin: true,
      onError: (err, req, res) => {
        console.error("Proxy error:", err);
        (res as any).status(502).json({
          error: "Backend service unavailable",
          message: err.message,
        });
      },
    })
  );

  const httpServer = createServer(app);

  return httpServer;
}
