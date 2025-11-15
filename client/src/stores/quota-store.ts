/**
 * Quota Store - Global state management for user message quota
 */
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface QuotaState {
  quotaRemaining: number;
  quotaLimit: number;
  isUnlimited: boolean;
  hasPersonalKey: boolean;
  isLoading: boolean;
  lastUpdated: number | null;
  
  // Actions
  setQuota: (remaining: number, isUnlimited: boolean, hasPersonalKey: boolean) => void;
  updateQuota: (remaining: number) => void;
  decrementQuota: () => void;
  resetQuota: () => void;
  setLoading: (loading: boolean) => void;
  
  // Computed
  getQuotaStatus: () => 'exhausted' | 'low' | 'normal' | 'unlimited';
  getQuotaColor: () => 'red' | 'orange' | 'green' | 'purple';
}

export const useQuotaStore = create<QuotaState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        quotaRemaining: 50, // Default quota
        quotaLimit: 50,
        isUnlimited: false,
        hasPersonalKey: false,
        isLoading: false,
        lastUpdated: null,

        // Set complete quota information (from API response)
        setQuota: (remaining, isUnlimited, hasPersonalKey) => {
          set({
            quotaRemaining: isUnlimited ? -1 : remaining,
            isUnlimited,
            hasPersonalKey,
            lastUpdated: Date.now(),
          }, false, 'setQuota');
        },

        // Update just the remaining count
        updateQuota: (remaining) => {
          set({
            quotaRemaining: remaining,
            lastUpdated: Date.now(),
          }, false, 'updateQuota');
        },

        // Decrement quota by 1 (optimistic update)
        decrementQuota: () => {
          const { quotaRemaining, isUnlimited } = get();
          if (!isUnlimited && quotaRemaining > 0) {
            set({
              quotaRemaining: quotaRemaining - 1,
              lastUpdated: Date.now(),
            }, false, 'decrementQuota');
          }
        },

        // Reset quota to limit
        resetQuota: () => {
          set({
            quotaRemaining: get().quotaLimit,
            lastUpdated: Date.now(),
          }, false, 'resetQuota');
        },

        // Set loading state
        setLoading: (loading) => {
          set({ isLoading: loading }, false, 'setLoading');
        },

        // Get current quota status for UI display
        getQuotaStatus: () => {
          const { quotaRemaining, isUnlimited } = get();
          
          if (isUnlimited) return 'unlimited';
          if (quotaRemaining <= 0) return 'exhausted';
          if (quotaRemaining <= 3) return 'low';
          return 'normal';
        },

        // Get color for quota display
        getQuotaColor: () => {
          const status = get().getQuotaStatus();
          
          switch (status) {
            case 'unlimited':
              return 'purple';
            case 'exhausted':
              return 'red';
            case 'low':
              return 'orange';
            default:
              return 'green';
          }
        },
      }),
      {
        name: 'quota-store',
        // Only persist essential data
        partialize: (state) => ({
          quotaRemaining: state.quotaRemaining,
          isUnlimited: state.isUnlimited,
          hasPersonalKey: state.hasPersonalKey,
          lastUpdated: state.lastUpdated,
        }),
      }
    ),
    {
      name: 'quota-store',
      enabled: import.meta.env.DEV,
    }
  )
);
