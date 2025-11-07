// Load environment variables first
import dotenv from "dotenv";
dotenv.config();

process.on("warning", (warning) => {
  if (!warning.message.includes("A PostCSS plugin did not pass the `from` option")) {
    console.warn(warning);
  }
});

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { createProxyMiddleware } from "http-proxy-middleware";
import { documentsRouter } from "./api/documents";
import { chatRouter } from "./api/chat";
import { configRouter } from "./api/config";
import { setupVite, serveStatic, log } from "./vite";
import { createServer } from "http";

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

// CORS configuration
app.use(cors({
  origin: true,
  credentials: true,
}));

// JSON and URL-encoded parsing for all routes
app.use(express.json({
  limit: '50mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));

app.use(express.urlencoded({ 
  extended: false,
  limit: '50mb'
}));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Proxy configuration for Python FastAPI endpoints
const pythonApiProxy = createProxyMiddleware({
  target: 'http://localhost:8000',
  changeOrigin: true,
} as any);

// Route specific endpoints to Python FastAPI BEFORE TypeScript routes
app.use('/api/query', pythonApiProxy);
app.use('/api/config', pythonApiProxy);
app.use('/api/chat', pythonApiProxy);

// API Routes (TypeScript Express endpoints) - more specific routes after proxy
app.use("/api/documents", documentsRouter);

// TypeScript health and analytics endpoints with different paths to avoid conflicts
app.get("/api/ts-health", (req, res) => {
  res.json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    version: "2.0.0",
    service: "typescript-express"
  });
});

// Mount remaining TypeScript config routes under /api/ts prefix to avoid conflicts
app.use("/api/ts", configRouter);

(async () => {
  const server = createServer(app);

  // Error handling middleware
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("[SERVER] Error:", err);
    res.status(status).json({ message });
  });

  // Setup Vite in development or serve static files in production
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Start server
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
    console.log(`\n  ➜  Local:   http://localhost:${port}/`);
    console.log(`  ➜  Network: http://0.0.0.0:${port}/\n`);
  });
})();
