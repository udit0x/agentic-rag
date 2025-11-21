import { useEffect, useState, useRef } from "react";
import { API_CONFIG } from "@/lib/api-config";

export interface BackendHealthStatus {
  isHealthy: boolean;
  isChecking: boolean;
  error: string | null;
  lastChecked: Date | null;
}

/**
 * Service health monitoring with optimized polling
 */
export function useBackendHealth() {
  const [status, setStatus] = useState<BackendHealthStatus>({
    isHealthy: false,
    isChecking: true,
    error: null,
    lastChecked: null,
  });

  // Track if a check is in progress to prevent concurrent requests (MUST be useRef, not useState!)
  const checkInProgressRef = useRef(false);

  const checkHealth = async (): Promise<boolean> => {
    // Prevent concurrent health checks
    // if (checkInProgressRef.current) {
    //   console.log('[HEALTH] Check already in progress, skipping');
    //   return status.isHealthy;
    // }

    try {
      checkInProgressRef.current = true;
      setStatus((prev) => ({ ...prev, isChecking: true, error: null }));

      // Single consolidated health check (removed duplicate secondary check)
      const response = await fetch(`${API_CONFIG.API_BASE_URL}/api/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Service unavailable: ${response.status}`);
      }

      const healthData = await response.json();
      
      if (!healthData || healthData.status !== "healthy") {
        throw new Error("Invalid service status");
      }

      setStatus({
        isHealthy: true,
        isChecking: false,
        error: null,
        lastChecked: new Date(),
      });

      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Service check failed";
      
      console.error("[HEALTH] Check failed:", errorMessage);

      setStatus({
        isHealthy: false,
        isChecking: false,
        error: errorMessage,
        lastChecked: new Date(),
      });

      return false;
    } finally {
      checkInProgressRef.current = false;
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  // Poll continuously regardless of health status (improved recovery behavior)
  useEffect(() => {
    const intervalId = setInterval(() => {
      checkHealth();
    }, 60000); // Poll every 60s

    return () => clearInterval(intervalId);
  }, []); // Empty deps - poll always, never restart interval

  return {
    ...status,
    retry: checkHealth,
  };
}
