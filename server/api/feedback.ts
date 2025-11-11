/**
 * Feedback API endpoints
 * Proxies to Python backend for actual implementation
 */

import { Router } from "express";

export const feedbackRouter = Router();

/**
 * All feedback operations are handled by the Python FastAPI backend
 * These routes proxy to the Python server
 */
feedbackRouter.all("/feedback/*", async (req, res) => {
  res.status(501).json({
    error: "Feedback functionality handled by Python backend",
    message: "Please use the Python FastAPI server at http://localhost:8000/api/feedback for feedback operations",
    pythonEndpoints: [
      "POST /api/feedback/submit - Submit message feedback",
      "GET /api/feedback/message/{message_id} - Get feedback for a message",
      "DELETE /api/feedback/message/{message_id} - Delete feedback"
    ]
  });
});

// Simple endpoint to list feedback endpoints
feedbackRouter.get("/endpoints", (req, res) => {
  res.json({
    pythonEndpoints: [
      "POST /api/feedback/submit - Submit feedback for a message",
      "GET /api/feedback/message/{message_id} - Get feedback for a specific message",
      "DELETE /api/feedback/message/{message_id} - Delete feedback for a message"
    ],
    note: "Feedback functionality is implemented in the Python FastAPI backend at port 8000"
  });
});
