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
import { clerkMiddleware } from "@clerk/express";
import { documentsRouter } from "./api/documents";
import { chatRouter } from "./api/chat";
import { configRouter } from "./api/config";
import { usersRouter } from "./api/users";
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

// Clerk authentication middleware - provide keys explicitly
app.use(clerkMiddleware({
  publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  secretKey: process.env.CLERK_SECRET_KEY,
}));

// ✅ CRITICAL FIX: Conditionally parse JSON only for NON-PROXY routes
// If we parse JSON for proxy routes, the stream is consumed and proxy fails
app.use((req, res, next) => {
  const path = req.path;
  
  // Skip JSON parsing for routes that will be proxied to FastAPI
  const willBeProxied = 
    path.startsWith('/api/query') ||
    path.startsWith('/api/config') ||
    path.startsWith('/api/chat-sessions') ||
    (path.startsWith('/api/chat') && !path.startsWith('/api/chat-sessions')) ||
    path.startsWith('/api/documents') ||
    path.startsWith('/api/feedback') ||  // Add feedback routes
    path === '/api/health';  // Add health check endpoint
  
  if (willBeProxied) {
    // console.log(`[MIDDLEWARE] Skipping JSON parsing for ${path} (will be proxied)`);
    return next();
  }
  
  // Parse JSON for non-proxied routes (like /api/users)
  express.json({ limit: '50mb' })(req, res, next);
});

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
      
      // ⚠️ Warn about slow requests
      if (duration > 1000) {
        logLine = `⚠️ SLOW ${logLine}`;
      }
      
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

// Middleware to extract Clerk userId and pass to FastAPI
app.use((req, res, next) => {
  // ✅ FIX: Extract userId from Clerk auth using function call instead of property
  const auth = (req as any).auth?.();
  if (auth?.userId) {
    // Add userId as header for FastAPI to consume
    (req.headers as any)['x-user-id'] = auth.userId;
  }
  next();
});

// Proxy configuration for Python FastAPI endpoints
const pythonApiUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
const pythonApiProxy = createProxyMiddleware({
  target: pythonApiUrl,
  changeOrigin: true,
  timeout: 300000,
  proxyTimeout: 300000,
  
  onProxyReq: (proxyReq: any, req: any, res: any) => {
    const userId = (req.headers as any)['x-user-id'];
    if (userId) {
      proxyReq.setHeader('x-user-id', userId);
    }
    // console.log(`[PROXY] Forwarding ${req.method} ${req.path} to FastAPI`);
  },
  
  onProxyRes: (proxyRes: any, req: any, res: any) => {
    // console.log(`[PROXY] Got response ${proxyRes.statusCode} from FastAPI for ${req.method} ${req.path}`);
  },
  
  onError: (err: any, req: any, res: any) => {
    console.error(`❌ [PROXY ERROR] ${req.method} ${req.path}:`, err.message);
    if (!res.headersSent) {
      res.status(502).json({
        error: 'Proxy Error',
        message: 'Cannot connect to FastAPI',
        details: err.message
      });
    }
  }
} as any);

// Route specific endpoints to Python FastAPI BEFORE TypeScript routes
// Use a filter function instead of mounting at specific paths to preserve full path
app.use((req, res, next) => {
  const path = req.path;
  
  // Debug logging for health check
  if (path === '/api/health') {
    // console.log(`[PROXY DEBUG] Health check request: ${req.method} ${path}`);
  }
  
  // Debug logging for streaming endpoint
  if (path.includes('/query/stream')) {
    // console.log(`[PROXY DEBUG] Streaming request received: ${req.method} ${path}`);
    // console.log(`[PROXY DEBUG] Headers:`, req.headers);
    // console.log(`[PROXY DEBUG] Has x-user-id:`, !!(req.headers as any)['x-user-id']);
  }
  
  // Check if this path should be proxied to FastAPI
  const shouldProxy = 
    path.startsWith('/api/query') ||
    path.startsWith('/api/config') ||
    path.startsWith('/api/chat-sessions') ||  // Check this BEFORE /api/chat
    (path.startsWith('/api/chat') && !path.startsWith('/api/chat-sessions')) ||
    path.startsWith('/api/documents') ||
    path.startsWith('/api/feedback') ||  // Add feedback routes to proxy
    path === '/api/health';  // Add health check endpoint
  
  if (shouldProxy) {
    // console.log(`[PROXY] Proxying ${req.method} ${path} to FastAPI`);
    return pythonApiProxy(req, res, next);
  }
  
  next();
});

// API Routes (TypeScript Express endpoints) - more specific routes after proxy
// Note: TypeScript /api/documents routes are now disabled since Python handles everything
// app.use("/api/documents", documentsRouter);  // Commented out - Python handles this
app.use("/api/users", usersRouter);

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
    // console.log(`\n  ➜  Local:   http://localhost:${port}/`);
    // console.log(`  ➜  Network: http://0.0.0.0:${port}/\n`);
  });
})();
