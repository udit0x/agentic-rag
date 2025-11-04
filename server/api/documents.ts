import { Router } from "express";

const router = Router();

// Health check endpoint for TypeScript document service
router.get("/health", async (req, res) => {
  res.json({ 
    status: "healthy", 
    service: "typescript-documents",
    message: "Document operations now handled by Python FastAPI"
  });
});

// Legacy endpoint - redirect to Python
router.post("/upload", async (req, res) => {
  res.status(410).json({ 
    error: "Document upload moved to Python API",
    message: "Please use Python FastAPI endpoint: POST http://localhost:8000/api/documents/upload",
    migrationNote: "This endpoint is deprecated. Frontend should use the Python API directly."
  });
});

// Legacy endpoint - redirect to Python  
router.post("/", async (req, res) => {
  res.status(410).json({ 
    error: "Document upload moved to Python API",
    message: "Please use Python FastAPI endpoint: POST http://localhost:8000/api/documents/upload",
    migrationNote: "This endpoint is deprecated. Frontend should use the Python API directly."
  });
});

// All other document operations now handled by Python
router.all("*", async (req, res) => {
  res.status(410).json({ 
    error: "Document operations moved to Python API",
    message: "Please use Python FastAPI endpoints: http://localhost:8000/api/documents/*",
    migrationNote: "TypeScript document API is deprecated in favor of Python FastAPI."
  });
});

export { router as documentsRouter };