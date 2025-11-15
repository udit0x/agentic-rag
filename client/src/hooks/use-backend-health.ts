import { useEffect, useState } from "react";
import { API_CONFIG } from "@/lib/api-config";

export interface BackendHealthStatus {
  isHealthy: boolean;
  isChecking: boolean;
  error: string | null;
  lastChecked: Date | null;
}

/**
 * Hook to check if the Python FastAPI backend is running and healthy
 * Prevents users from accessing the app when backend is down
 */
export function useBackendHealth() {
  const [status, setStatus] = useState<BackendHealthStatus>({
    isHealthy: false,
    isChecking: true,
    error: null,
    lastChecked: null,
  });

  const checkHealth = async (): Promise<boolean> => {
    try {
      setStatus((prev) => ({ ...prev, isChecking: true, error: null }));

      // Check Express server health (port 3000)
      const expressResponse = await fetch(`${API_CONFIG.API_BASE_URL}/api/ts-health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (!expressResponse.ok) {
        throw new Error(`Express server unhealthy: ${expressResponse.status}`);
      }

      // Check Python FastAPI backend health through Express proxy
      // This endpoint should be proxied to Python's /api/health
      const pythonResponse = await fetch(`${API_CONFIG.API_BASE_URL}/api/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (!pythonResponse.ok) {
        throw new Error(
          `Python backend unhealthy: ${pythonResponse.status} ${pythonResponse.statusText}`
        );
      }

      const healthData = await pythonResponse.json();
      
      // Validate response structure
      if (!healthData || healthData.status !== "healthy") {
        throw new Error("Python backend returned invalid health status");
      }

      setStatus({
        isHealthy: true,
        isChecking: false,
        error: null,
        lastChecked: new Date(),
      });

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      console.error("[BACKEND_HEALTH] Health check failed:", errorMessage);

      setStatus({
        isHealthy: false,
        isChecking: false,
        error: errorMessage,
        lastChecked: new Date(),
      });

      return false;
    }
  };

  // Initial health check on mount
  useEffect(() => {
    checkHealth();
  }, []);

  // Periodic health check every 30 seconds when backend is healthy
  useEffect(() => {
    if (!status.isHealthy) {
      return;
    }

    const intervalId = setInterval(() => {
      checkHealth();
    }, 30000); // 30 seconds

    return () => clearInterval(intervalId);
  }, [status.isHealthy]);

  return {
    ...status,
    retry: checkHealth,
  };
}
