import { useEffect, useState } from "react";
import { API_CONFIG } from "@/lib/api-config";

export interface BackendHealthStatus {
  isHealthy: boolean;
  isChecking: boolean;
  error: string | null;
  lastChecked: Date | null;
}

/**
 * Service health monitoring
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

      // Primary service check
      const primaryResponse = await fetch(`${API_CONFIG.API_BASE_URL}/api/ts-health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });

      if (!primaryResponse.ok) {
        throw new Error(`Service unavailable: ${primaryResponse.status}`);
      }

      // Secondary service check
      const secondaryResponse = await fetch(`${API_CONFIG.API_BASE_URL}/api/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });

      if (!secondaryResponse.ok) {
        throw new Error(`Service unavailable: ${secondaryResponse.status}`);
      }

      const healthData = await secondaryResponse.json();
      
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
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  useEffect(() => {
    if (!status.isHealthy) {
      return;
    }

    const intervalId = setInterval(() => {
      checkHealth();
    }, 30000);

    return () => clearInterval(intervalId);
  }, [status.isHealthy]);

  return {
    ...status,
    retry: checkHealth,
  };
}
