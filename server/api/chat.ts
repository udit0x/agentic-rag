import { Router } from "express";
import { z } from "zod";

const router = Router();

// Simple health check endpoint for Node.js API
router.get("/health", async (req, res) => {
  res.json({ 
    status: "healthy", 
    service: "node-api-server",
    timestamp: new Date().toISOString()
  });
});

// Proxy endpoint that forwards to Python backend
// All actual chat functionality is handled by the Python FastAPI server
router.all("/chat/*", async (req, res) => {
  res.status(501).json({
    error: "Chat functionality moved to Python backend",
    message: "Please use the Python FastAPI server at http://localhost:8000/api/ for chat operations",
    pythonEndpoints: [
      "POST /api/query - Process queries with RAG agents",
      "POST /api/query/stream - Stream query processing",
      "GET /api/chat/{session_id} - Get chat history"
    ]
  });
});

// Simple endpoint to list available endpoints
router.get("/endpoints", (req, res) => {
  res.json({
    nodeEndpoints: [
      "GET /api/health - Health check",
      "GET /api/endpoints - This endpoint"
    ],
    pythonEndpoints: [
      "POST /api/query - Process queries with RAG agents",
      "POST /api/query/stream - Stream query processing", 
      "GET /api/chat/{session_id} - Get chat history",
      "POST /api/documents/upload - Upload documents",
      "GET /api/documents - List documents"
    ],
    note: "Most functionality is implemented in the Python FastAPI backend at port 8000"
  });
});

export { router as chatRouter };