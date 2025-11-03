import type { Express } from "express";
import { createServer, type Server } from "http";
import { createProxyMiddleware } from "http-proxy-middleware";

export async function registerRoutes(app: Express): Promise<Server> {
  // Add debug middleware to log all requests
  app.use('/api', (req, res, next) => {
    console.log(`[DEBUG] Incoming request: ${req.method} ${req.url}`);
    console.log(`[DEBUG] Original URL: ${req.originalUrl}`);
    if (req.method === 'POST') {
      console.log(`[DEBUG] POST request body size: ${req.get('content-length') || 'unknown'}`);
      console.log(`[DEBUG] Content-Type: ${req.get('content-type') || 'unknown'}`);
    }
    next();
  });

  // Proxy all /api requests to FastAPI backend  
  app.use(
    "/api",
    createProxyMiddleware({
      target: "http://localhost:8000",
      changeOrigin: true,
      timeout: 120000, // 2 minute timeout for uploads
      // Simple path rewrite - Express strips /api, we add it back
      pathRewrite: {
        '^/': '/api/',
      },
      // Add proper headers
      headers: {
        'Connection': 'keep-alive',
      },
    })
  );

  const httpServer = createServer(app);

  return httpServer;
}
