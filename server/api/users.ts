import { Router } from "express";
import type { Request, Response } from "express";
import { clerkClient, requireAuth } from "@clerk/express";

const router = Router();

// Extend Express Request type for Clerk auth
interface AuthRequest extends Request {
  auth: {
    userId: string;
    sessionId: string;
  };
}

interface SyncUserRequest {
  id: string;
  email: string;
  name: string;
  picture?: string;
  locale?: string;
  preferences?: Record<string, any>;
}

/**
 * Sync user from Clerk to database
 * Creates or updates user record
 */
router.post("/sync", async (req: Request, res: Response) => {
  try {
    const userData: SyncUserRequest = req.body;

    if (!userData.id || !userData.email || !userData.name) {
      return res.status(400).json({
        error: "Missing required fields: id, email, name",
      });
    }

    // Call Python backend to sync user
    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
    
    const response = await fetch(`${pythonBackendUrl}/api/users/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: userData.id,
        email: userData.email,
        name: userData.name,
        picture: userData.picture,
        locale: userData.locale || "en",
        preferences: userData.preferences || {},
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[USER_SYNC] Error from Python backend:", errorText);
      return res.status(response.status).json({
        error: "Failed to sync user",
        details: errorText,
      });
    }

    const result = await response.json();
    
    return res.status(200).json({
      success: true,
      user: result,
    });
  } catch (error) {
    console.error("[USER_SYNC] Error syncing user:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get current authenticated user
 */
router.get("/me", requireAuth(), async (req: Request, res: Response) => {
  try {
    // ✅ FIX: Use req.auth() as a function instead of property
    const auth = (req as any).auth();
    const { userId } = auth;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Fetch user from Clerk
    const clerkUser = await clerkClient.users.getUser(userId);

    return res.status(200).json({
      id: clerkUser.id,
      email: clerkUser.emailAddresses[0]?.emailAddress,
      name: clerkUser.fullName || clerkUser.username || "Anonymous",
      picture: clerkUser.imageUrl,
      locale: clerkUser.publicMetadata?.locale,
      preferences: clerkUser.publicMetadata?.preferences,
    });
  } catch (error) {
    console.error("[USER_ME] Error fetching user:", error);
    return res.status(500).json({
      error: "Failed to fetch user",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get quota status for authenticated user
 * Proxies to FastAPI backend
 */
router.get("/me/quota", requireAuth(), async (req: Request, res: Response) => {
  try {
    const auth = (req as any).auth();
    const { userId } = auth;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
    
    const response = await fetch(`${pythonBackendUrl}/api/users/me/quota`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-User-ID": userId, // Pass Clerk user ID to FastAPI
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[USER_QUOTA] Error from Python backend:", errorText);
      return res.status(response.status).json({
        error: "Failed to fetch quota",
        details: errorText,
      });
    }

    const result = await response.json();
    return res.status(200).json(result);
  } catch (error) {
    console.error("[USER_QUOTA] Error fetching quota:", error);
    return res.status(500).json({
      error: "Failed to fetch quota",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get user preferences
 * Proxies to FastAPI backend
 */
router.get("/me/preferences", requireAuth(), async (req: Request, res: Response) => {
  try {
    const auth = (req as any).auth();
    const { userId } = auth;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
    
    const response = await fetch(`${pythonBackendUrl}/api/users/me/preferences`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-User-ID": userId,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[USER_PREFERENCES] Error from Python backend:", errorText);
      return res.status(response.status).json({
        error: "Failed to fetch preferences",
        details: errorText,
      });
    }

    const result = await response.json();
    return res.status(200).json(result);
  } catch (error) {
    console.error("[USER_PREFERENCES] Error fetching preferences:", error);
    return res.status(500).json({
      error: "Failed to fetch preferences",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Update user preferences
 * Proxies to FastAPI backend
 */
router.post("/me/preferences", requireAuth(), async (req: Request, res: Response) => {
  try {
    const auth = (req as any).auth();
    const { userId } = auth;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
    
    const response = await fetch(`${pythonBackendUrl}/api/users/me/preferences`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-ID": userId,
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[USER_PREFERENCES] Error from Python backend:", errorText);
      return res.status(response.status).json({
        error: "Failed to update preferences",
        details: errorText,
      });
    }

    const result = await response.json();
    return res.status(200).json(result);
  } catch (error) {
    console.error("[USER_PREFERENCES] Error updating preferences:", error);
    return res.status(500).json({
      error: "Failed to update preferences",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Get personal API key status
 * Proxies to FastAPI backend
 */
router.get("/me/personal-key/status", requireAuth(), async (req: Request, res: Response) => {
  try {
    const auth = (req as any).auth();
    const { userId } = auth;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
    
    const response = await fetch(`${pythonBackendUrl}/api/users/me/personal-key/status`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-User-ID": userId,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[PERSONAL_KEY_STATUS] Error from Python backend:", errorText);
      return res.status(response.status).json({
        error: "Failed to fetch key status",
        details: errorText,
      });
    }

    const result = await response.json();
    return res.status(200).json(result);
  } catch (error) {
    console.error("[PERSONAL_KEY_STATUS] Error fetching key status:", error);
    return res.status(500).json({
      error: "Failed to fetch key status",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Save personal API key
 * Proxies to FastAPI backend
 */
router.post("/me/personal-key", requireAuth(), async (req: Request, res: Response) => {
  try {
    const auth = (req as any).auth();
    const { userId } = auth;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
    
    const response = await fetch(`${pythonBackendUrl}/api/users/me/personal-key`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-ID": userId,
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[PERSONAL_KEY_SAVE] Error from Python backend:", errorText);
      return res.status(response.status).json({
        error: "Failed to save API key",
        details: errorText,
      });
    }

    const result = await response.json();
    return res.status(200).json(result);
  } catch (error) {
    console.error("[PERSONAL_KEY_SAVE] Error saving API key:", error);
    return res.status(500).json({
      error: "Failed to save API key",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Delete personal API key
 * Proxies to FastAPI backend
 */
router.delete("/me/personal-key", requireAuth(), async (req: Request, res: Response) => {
  try {
    const auth = (req as any).auth();
    const { userId } = auth;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
    
    const response = await fetch(`${pythonBackendUrl}/api/users/me/personal-key`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "X-User-ID": userId,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[PERSONAL_KEY_DELETE] Error from Python backend:", errorText);
      return res.status(response.status).json({
        error: "Failed to delete API key",
        details: errorText,
      });
    }

    const result = await response.json();
    return res.status(200).json(result);
  } catch (error) {
    console.error("[PERSONAL_KEY_DELETE] Error deleting API key:", error);
    return res.status(500).json({
      error: "Failed to delete API key",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export { router as usersRouter };
