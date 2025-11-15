/**
 * Quota API hooks for fetching and managing user quota
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, API_CONFIG } from '@/lib/api-config';
import { useQuotaStore } from '@/stores/quota-store';
import { useCallback } from 'react';

// API Response types
interface QuotaResponse {
  userId: string;
  email: string;
  remaining: number; // -1 if unlimited
  isUnlimited: boolean;
  hasPersonalKey: boolean;
}

interface PersonalKeyStatusResponse {
  hasPersonalKey: boolean;
  provider: string | null;
  quotaRemaining: number;
  isUnlimited: boolean;
}

interface SavePersonalKeyRequest {
  apiKey: string;
  provider: 'openai' | 'azure' | 'gemini';
}

/**
 * Fetch current user's quota status
 */
export function useQuota() {
  const queryClient = useQueryClient();
  const { setQuota, setLoading } = useQuotaStore();

  const query = useQuery({
    queryKey: ['user-quota'],
    queryFn: async () => {
      const response = await apiRequest<QuotaResponse>(
        `${API_CONFIG.API_BASE_URL}/api/users/me/quota`
      );
      
      // Update global quota store
      setQuota(
        response.remaining === -1 ? 999 : response.remaining,
        response.isUnlimited,
        response.hasPersonalKey
      );
      
      return response;
    },
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const refreshQuota = useCallback(async () => {
    setLoading(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['user-quota'] });
      await query.refetch();
    } finally {
      setLoading(false);
    }
  }, [queryClient, query, setLoading]);

  return {
    quota: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refreshQuota,
  };
}

/**
 * Update quota after each message (called automatically from chat response)
 */
export function useSyncQuotaFromResponse() {
  const { updateQuota, setQuota } = useQuotaStore();
  
  return useCallback((response: any) => {
    // Check if response includes quota information
    if (response.quotaRemaining !== undefined) {
      updateQuota(response.quotaRemaining);
    }
    
    // Full quota sync if complete info available
    if (response.quota) {
      setQuota(
        response.quota.remaining,
        response.quota.isUnlimited,
        response.quota.hasPersonalKey
      );
    }
  }, [updateQuota, setQuota]);
}

/**
 * Fetch personal key status
 */
export function usePersonalKeyStatus() {
  return useQuery({
    queryKey: ['personal-key-status'],
    queryFn: async () => {
      const response = await apiRequest<PersonalKeyStatusResponse>(
        `${API_CONFIG.API_BASE_URL}/api/users/me/personal-key/status`
      );
      return response;
    },
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Save personal API key (encrypted)
 */
export function useSavePersonalKey() {
  const queryClient = useQueryClient();
  const { setQuota } = useQuotaStore();

  return useMutation({
    mutationFn: async (data: SavePersonalKeyRequest) => {
      const response = await apiRequest(
        `${API_CONFIG.API_BASE_URL}/api/users/me/personal-key`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      );
      return response;
    },
    onSuccess: () => {
      // Refresh quota and personal key status
      queryClient.invalidateQueries({ queryKey: ['user-quota'] });
      queryClient.invalidateQueries({ queryKey: ['personal-key-status'] });
      
      // Update store to reflect unlimited quota with personal key
      setQuota(999, false, true);
    },
  });
}

/**
 * Remove personal API key
 */
export function useDeletePersonalKey() {
  const queryClient = useQueryClient();
  const { setQuota } = useQuotaStore();

  return useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        `${API_CONFIG.API_BASE_URL}/api/users/me/personal-key`,
        {
          method: 'DELETE',
        }
      );
      return response;
    },
    onSuccess: () => {
      // Refresh quota and personal key status
      queryClient.invalidateQueries({ queryKey: ['user-quota'] });
      queryClient.invalidateQueries({ queryKey: ['personal-key-status'] });
      
      // Restore default quota (50 messages)
      setQuota(50, false, false);
    },
  });
}
