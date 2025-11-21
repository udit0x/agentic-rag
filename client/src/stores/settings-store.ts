/**
 * Settings Store - Centralized state management for application settings & API configuration
 * 
 * This store is the SINGLE SOURCE OF TRUTH for:
 * - LLM configuration (OpenAI/Azure)
 * - Embeddings configuration (OpenAI/Azure)
 * - Connection validation & testing
 * - Save/delete operations
 * - All validation logic
 * 
 * UI components should ONLY:
 * - Read from this store
 * - Dispatch actions to this store
 * - Render based on store state
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { apiRequest, API_ENDPOINTS } from '@/lib/api-config';

// ============================================================================
// Types
// ============================================================================

type LLMProvider = 'openai' | 'azure';
type EmbeddingProvider = 'openai' | 'azure';
type TestStatus = 'idle' | 'testing' | 'success' | 'error';

interface LLMConfig {
  provider: LLMProvider;
  openaiApiKey: string;
  openaiModel: string;
  azureApiKey: string;
  azureEndpoint: string;
  azureDeploymentName: string;
}

interface EmbeddingConfig {
  provider: EmbeddingProvider;
  apiKey: string;
  endpoint: string;
  model: string;
}

interface GeneralSettings {
  enableTracing: boolean;
  debugMode: boolean;
  temperature: number;
  maxTokens: number;
  model: string;
  theme: 'light' | 'dark' | 'system';
  enableAnimations: boolean;
  enableKeyboardShortcuts: boolean;
  useGeneralKnowledge: boolean;
  documentRelevanceThreshold: number;
}

interface TestResult {
  status: TestStatus;
  message: string;
}

interface ValidationError {
  field: string;
  message: string;
}

interface SettingsState {
  // Configuration
  llm: LLMConfig;
  embedding: EmbeddingConfig;
  general: GeneralSettings;
  
  // Test results
  llmTest: TestResult;
  embeddingTest: TestResult;
  
  // Validation
  validationErrors: ValidationError[];
  
  // UI state
  isSaving: boolean;
  isDeleting: boolean;
  isTesting: boolean;
  isLoadingConfig: boolean; 
  hasUnsavedChanges: boolean;
  isConfigurationSaved: boolean; // Backend has saved config
  
  // Computed
  canSave: () => boolean;
  canTest: () => boolean;
  hasValidConfiguration: () => boolean;
  
  // Actions - LLM
  setLLMProvider: (provider: LLMProvider) => void;
  setLLMField: (field: keyof LLMConfig, value: string) => void;
  
  // Actions - Embedding
  setEmbeddingProvider: (provider: EmbeddingProvider) => void;
  setEmbeddingField: (field: keyof EmbeddingConfig, value: string) => void;
  
  // Actions - General
  setGeneralSetting: <K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) => void;
  
  // Actions - Operations
  testConfiguration: () => Promise<void>;
  saveConfiguration: () => Promise<void>;
  deleteConfiguration: () => Promise<void>;
  loadConfiguration: () => Promise<void>;
  
  // Actions - Reset
  resetTestResults: () => void;
  clearValidationErrors: () => void;
}

// ============================================================================
// Default State
// ============================================================================

const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'azure',
  openaiApiKey: '',
  openaiModel: 'gpt-4o',
  azureApiKey: '',
  azureEndpoint: '',
  azureDeploymentName: 'gpt-4o',
};

const DEFAULT_EMBEDDING_CONFIG: EmbeddingConfig = {
  provider: 'azure',
  apiKey: '',
  endpoint: '',
  model: 'text-embedding-3-large',
};

const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  enableTracing: true,
  debugMode: false,
  temperature: 0.7,
  maxTokens: 2000,
  model: 'gpt-4o',
  theme: 'system',
  enableAnimations: true,
  enableKeyboardShortcuts: true,
  useGeneralKnowledge: true,
  documentRelevanceThreshold: 0.65,
};

const DEFAULT_TEST_RESULT: TestResult = {
  status: 'idle',
  message: '',
};

// ============================================================================
// Validation Helpers
// ============================================================================

const isValidUrl = (url: string): boolean => {
  if (!url.trim()) return false;
  const urlPattern = /^https?:\/\/.+/i;
  return urlPattern.test(url.trim());
};

const validateLLMConfig = (llm: LLMConfig): ValidationError[] => {
  const errors: ValidationError[] = [];
  
  if (llm.provider === 'openai') {
    // '***' means existing key is saved, which is valid
    if (!llm.openaiApiKey.trim() || (llm.openaiApiKey.trim() !== '***' && llm.openaiApiKey.length < 20)) {
      if (!llm.openaiApiKey.trim()) {
        errors.push({ field: 'openaiApiKey', message: 'OpenAI API key is required' });
      }
    }
  } else if (llm.provider === 'azure') {
    // '***' means existing key is saved, which is valid
    if (!llm.azureApiKey.trim() || (llm.azureApiKey.trim() !== '***' && llm.azureApiKey.length < 20)) {
      if (!llm.azureApiKey.trim()) {
        errors.push({ field: 'azureApiKey', message: 'Azure API key is required' });
      }
    }
    if (!llm.azureEndpoint.trim()) {
      errors.push({ field: 'azureEndpoint', message: 'Azure endpoint is required' });
    } else if (!isValidUrl(llm.azureEndpoint)) {
      errors.push({ field: 'azureEndpoint', message: 'Azure endpoint must start with http:// or https://' });
    }
    if (!llm.azureDeploymentName.trim()) {
      errors.push({ field: 'azureDeploymentName', message: 'Azure deployment name is required' });
    }
  }
  
  return errors;
};

const validateEmbeddingConfig = (embedding: EmbeddingConfig): ValidationError[] => {
  const errors: ValidationError[] = [];
  
  // '***' means existing key is saved, which is valid
  if (!embedding.apiKey.trim() || (embedding.apiKey.trim() !== '***' && embedding.apiKey.length < 20)) {
    if (!embedding.apiKey.trim()) {
      errors.push({ 
        field: 'embeddingApiKey', 
        message: `${embedding.provider === 'azure' ? 'Azure' : 'OpenAI'} API key is required for embeddings` 
      });
    }
  }
  
  if (embedding.provider === 'azure') {
    if (!embedding.endpoint.trim()) {
      errors.push({ field: 'embeddingEndpoint', message: 'Azure endpoint is required for embeddings' });
    } else if (!isValidUrl(embedding.endpoint)) {
      errors.push({ field: 'embeddingEndpoint', message: 'Azure endpoint must start with http:// or https://' });
    }
  }
  
  return errors;
};

// ============================================================================
// Store
// ============================================================================

export const useSettingsStore = create<SettingsState>()(
  devtools(
    (set, get) => ({
      // Initial state
      llm: { ...DEFAULT_LLM_CONFIG },
      embedding: { ...DEFAULT_EMBEDDING_CONFIG },
      general: { ...DEFAULT_GENERAL_SETTINGS },
      
      llmTest: { ...DEFAULT_TEST_RESULT },
      embeddingTest: { ...DEFAULT_TEST_RESULT },
      
      validationErrors: [],
      
      isSaving: false,
      isDeleting: false,
      isTesting: false,
      isLoadingConfig: false, // 🚀 SETTINGS FIX: Now part of state instead of module-level
      hasUnsavedChanges: false,
      isConfigurationSaved: false,
      
      // Computed
      canSave: () => {
        const { llm, embedding, llmTest, embeddingTest, isSaving, isTesting, isDeleting, isConfigurationSaved } = get();
        
        // If configuration is already saved and user is viewing it (keys show as ***),
        // they can save again (e.g., after changing provider settings)
        const hasExistingConfig = isConfigurationSaved && (
          llm.openaiApiKey === '***' || 
          llm.azureApiKey === '***' || 
          embedding.apiKey === '***'
        );
        
        // Can save if:
        // 1. Both tests passed (new configuration), OR
        // 2. Has existing saved config with valid fields (updating settings only)
        const canSaveConfig = (
          (llmTest.status === 'success' && embeddingTest.status === 'success') ||
          (hasExistingConfig && get().hasValidConfiguration())
        );
        
        return canSaveConfig && !isSaving && !isTesting && !isDeleting;
      },
      
      canTest: () => {
        const { llm, embedding, isTesting, isSaving, isDeleting } = get();
        
        // Cannot test if keys are masked (user needs to enter actual keys to test)
        const hasMaskedKeys = (
          llm.openaiApiKey === '***' || 
          llm.azureApiKey === '***' || 
          embedding.apiKey === '***'
        );
        
        return !hasMaskedKeys && !isTesting && !isSaving && !isDeleting;
      },
      
      hasValidConfiguration: () => {
        const { llm, embedding } = get();
        const llmErrors = validateLLMConfig(llm);
        const embeddingErrors = validateEmbeddingConfig(embedding);
        return llmErrors.length === 0 && embeddingErrors.length === 0;
      },
      
      // Actions - LLM
      setLLMProvider: (provider) => {
        set((state) => ({
          llm: {
            ...state.llm,
            provider,
          },
          // CRITICAL: Sync embedding provider (personal keys require same provider)
          embedding: {
            ...state.embedding,
            provider,
          },
          // CRITICAL: Full reset when provider changes
          llmTest: { ...DEFAULT_TEST_RESULT },
          embeddingTest: { ...DEFAULT_TEST_RESULT },
          validationErrors: state.validationErrors.filter(e => !e.field.includes('openai') && !e.field.includes('azure') && !e.field.includes('embedding')),
          hasUnsavedChanges: true,
        }), false, 'setLLMProvider');
      },
      
      setLLMField: (field, value) => {
        set((state) => ({
          llm: {
            ...state.llm,
            [field]: value,
          },
          // Clear validation error for this field
          validationErrors: state.validationErrors.filter(e => e.field !== field),
          hasUnsavedChanges: true,
        }), false, 'setLLMField');
      },
      
      // Actions - Embedding
      setEmbeddingProvider: (provider) => {
        // CRITICAL: Personal keys require same provider for LLM and Embeddings
        // So changing embedding provider should sync LLM provider too
        set((state) => ({
          llm: {
            ...state.llm,
            provider,
          },
          embedding: {
            ...DEFAULT_EMBEDDING_CONFIG,
            provider,
          },
          // CRITICAL: Full reset when provider changes
          llmTest: { ...DEFAULT_TEST_RESULT },
          embeddingTest: { ...DEFAULT_TEST_RESULT },
          validationErrors: [],
          hasUnsavedChanges: true,
        }), false, 'setEmbeddingProvider');
      },
      
      setEmbeddingField: (field, value) => {
        set((state) => ({
          embedding: {
            ...state.embedding,
            [field]: value,
          },
          // Clear validation error for this field
          validationErrors: state.validationErrors.filter(e => e.field !== `embedding${field.charAt(0).toUpperCase() + field.slice(1)}`),
          hasUnsavedChanges: true,
        }), false, 'setEmbeddingField');
      },
      
      // Actions - General
      setGeneralSetting: async (key, value) => {
        set((state) => ({
          general: {
            ...state.general,
            [key]: value,
          },
          hasUnsavedChanges: true,
        }), false, 'setGeneralSetting');
        
        // Auto-save specific user preference settings to backend
        if (key === 'useGeneralKnowledge' || key === 'documentRelevanceThreshold') {
          try {
            const payload: Record<string, any> = {};
            payload[key] = value;
            
            await apiRequest(API_ENDPOINTS.USER.SETTINGS, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
          } catch (error) {
            console.error(`[SettingsStore] Failed to save ${key}:`, error);
          }
        }
      },
      
      // Actions - Operations
      testConfiguration: async () => {
        const { llm, embedding, canTest } = get();
        
        if (!canTest()) {
          return;
        }
        
        // Validate before testing
        const llmErrors = validateLLMConfig(llm);
        const embeddingErrors = validateEmbeddingConfig(embedding);
        const allErrors = [...llmErrors, ...embeddingErrors];
        
        if (allErrors.length > 0) {
          set({
            validationErrors: allErrors,
            llmTest: { status: 'error', message: 'Please fix validation errors before testing' },
            embeddingTest: { status: 'error', message: 'Please fix validation errors before testing' },
          }, false, 'testConfiguration:validation-failed');
          return;
        }
        
        set({ 
          isTesting: true, 
          validationErrors: [],
          llmTest: { status: 'testing', message: 'Testing LLM configuration...' },
          embeddingTest: { status: 'testing', message: 'Testing embeddings configuration...' },
        }, false, 'testConfiguration:start');
        
        try {
          const testData = {
            llmProvider: llm.provider,
            openaiApiKey: llm.openaiApiKey,
            openaiModel: llm.openaiModel,
            azureApiKey: llm.azureApiKey,
            azureEndpoint: llm.azureEndpoint,
            azureDeploymentName: llm.azureDeploymentName,
            embeddingProvider: embedding.provider,
            embeddingApiKey: embedding.apiKey,
            embeddingEndpoint: embedding.endpoint,
            embeddingModel: embedding.model,
          };
          
          const response: any = await apiRequest(API_ENDPOINTS.CONFIG.PING, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(testData),
          });
          
          if (response.success) {
            set({
              llmTest: { status: 'success', message: 'LLM Configuration Verified' },
              embeddingTest: { status: 'success', message: 'Embeddings Configuration Verified' },
              isTesting: false,
            }, false, 'testConfiguration:success');
          } else {
            set({
              llmTest: {
                status: response.llmTest?.error ? 'error' : 'success',
                message: response.llmTest?.error || 'LLM Configuration Verified',
              },
              embeddingTest: {
                status: response.embeddingTest?.error ? 'error' : 'success',
                message: response.embeddingTest?.error || 'Embeddings Configuration Verified',
              },
              isTesting: false,
            }, false, 'testConfiguration:partial-failure');
          }
        } catch (error: any) {
          set({
            llmTest: { 
              status: 'error', 
              message: `Connection Failed: ${error.message || 'Unable to connect'}` 
            },
            embeddingTest: { status: 'error', message: 'Test aborted due to connection failure' },
            isTesting: false,
          }, false, 'testConfiguration:error');
        }
      },
      
      saveConfiguration: async () => {
        const { llm, embedding, general, canSave, isConfigurationSaved } = get();
        
        if (!canSave()) {
          return;
        }
        
        // Check if we're updating an existing config (keys are masked as ***)
        const isUpdatingExisting = isConfigurationSaved && (
          llm.openaiApiKey === '***' || 
          llm.azureApiKey === '***' || 
          embedding.apiKey === '***'
        );
        
        // If updating existing config with masked keys, we can't proceed
        // User needs to either keep using existing (no save needed) or enter new keys
        if (isUpdatingExisting) {
          set({ 
            hasUnsavedChanges: false,
          }, false, 'saveConfiguration:no-changes');
          return;
        }
        
        // Personal keys require same provider for LLM and Embeddings
        if (llm.provider !== embedding.provider) {
          throw new Error('Personal API keys must use the same provider for both LLM and Embeddings');
        }
        
        set({ isSaving: true }, false, 'saveConfiguration:start');
        
        try {
          // Determine which API key to use based on provider
          let apiKey = '';
          let provider = llm.provider;
          const payload: any = {
            provider: provider,
          };
          
          if (llm.provider === 'openai') {
            apiKey = llm.openaiApiKey;
          } else if (llm.provider === 'azure') {
            apiKey = llm.azureApiKey;
            // Azure requires endpoint and deployment
            if (!llm.azureEndpoint || !llm.azureDeploymentName) {
              throw new Error('Azure provider requires endpoint and deployment name');
            }
            payload.azureEndpoint = llm.azureEndpoint;
            payload.azureDeploymentName = llm.azureDeploymentName;
          } else if (llm.provider === 'gemini') {
            // TODO: Add Gemini support when available
            apiKey = llm.openaiApiKey; // Fallback for now
          }
          
          if (!apiKey || apiKey === '***') {
            throw new Error('No API key provided');
          }
          
          payload.apiKey = apiKey;
          
          // Save as personal API key (user-specific, bypasses quota)
          await apiRequest(API_ENDPOINTS.USER.KEY, {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          
          set({ 
            isSaving: false, 
            hasUnsavedChanges: false,
            isConfigurationSaved: true,
          }, false, 'saveConfiguration:success');
        } catch (error) {
          console.error('Failed to save configuration:', error);
          set({ isSaving: false }, false, 'saveConfiguration:error');
          throw error;
        }
      },
      
      deleteConfiguration: async () => {
        set({ isDeleting: true }, false, 'deleteConfiguration:start');
        
        try {
          // Delete from backend first
          await apiRequest(API_ENDPOINTS.USER.KEY, {
            method: "DELETE",
          });
          
          // Reset to defaults - this ensures store is clean
          set({
            llm: { ...DEFAULT_LLM_CONFIG },
            embedding: { ...DEFAULT_EMBEDDING_CONFIG },
            llmTest: { ...DEFAULT_TEST_RESULT },
            embeddingTest: { ...DEFAULT_TEST_RESULT },
            validationErrors: [],
            isDeleting: false,
            hasUnsavedChanges: false,
            isConfigurationSaved: false,
          }, false, 'deleteConfiguration:reset');
          
          // Reload from backend to ensure sync (should return empty config)
          await get().loadConfiguration();
        } catch (error) {
          console.error('Failed to delete configuration:', error);
          set({ isDeleting: false }, false, 'deleteConfiguration:error');
          throw error;
        }
      },
      
      loadConfiguration: async () => {
        //  Use store state instead of module-level boolean
        const { isLoadingConfig } = get();
        if (isLoadingConfig) return;

        try {
          set({ isLoadingConfig: true }, false, 'loadConfiguration:start');
          
          const response: any = await apiRequest(API_ENDPOINTS.CONFIG.CURRENT);
          
          if (response && response.config) {
            const config = response.config;
            
            // CRITICAL: Only load personal configs in settings panel
            // System admin configs (source !== "personal") should not be editable here
            const isPersonalConfig = config.source === "personal";
            
            // Check if we actually have a personal API key configured
            // (API keys are masked as "***" if present)
            const hasSavedConfig = isPersonalConfig && !!(
              (config.openaiApiKey && config.openaiApiKey.trim() && config.openaiApiKey !== '') || 
              (config.azureApiKey && config.azureApiKey.trim() && config.azureApiKey !== '') || 
              (config.geminiApiKey && config.geminiApiKey.trim() && config.geminiApiKey !== '')
            );
            
            // If no personal config, use defaults (don't show system admin config)
            if (!hasSavedConfig) {
              set({
                llm: { ...DEFAULT_LLM_CONFIG },
                embedding: { ...DEFAULT_EMBEDDING_CONFIG },
                general: {
                  ...DEFAULT_GENERAL_SETTINGS,
                  useGeneralKnowledge: config.useGeneralKnowledge ?? DEFAULT_GENERAL_SETTINGS.useGeneralKnowledge,
                  documentRelevanceThreshold: config.documentRelevanceThreshold ?? DEFAULT_GENERAL_SETTINGS.documentRelevanceThreshold,
                },
                llmTest: { ...DEFAULT_TEST_RESULT },
                embeddingTest: { ...DEFAULT_TEST_RESULT },
                validationErrors: [],
                isConfigurationSaved: false,
                hasUnsavedChanges: false,
                isLoadingConfig: false,
              }, false, 'loadConfiguration:empty-config');
              return;
            }
            
            // Load personal configuration
            // IMPORTANT: Keep '***' as placeholder to show user that key is saved
            const newLLMConfig = {
              provider: config.llmProvider || DEFAULT_LLM_CONFIG.provider,
              openaiApiKey: config.openaiApiKey || '',
              openaiModel: config.openaiModel || DEFAULT_LLM_CONFIG.openaiModel,
              azureApiKey: config.azureApiKey || '',
              azureEndpoint: config.azureEndpoint || '',
              azureDeploymentName: config.azureDeploymentName || '',
            };
            
            const newEmbeddingConfig = {
              // Sync with LLM provider (personal keys use same provider)
              provider: config.llmProvider || DEFAULT_EMBEDDING_CONFIG.provider,
              apiKey: config.embeddingApiKey || '',
              endpoint: config.embeddingEndpoint || '',
              model: config.embeddingModel || DEFAULT_EMBEDDING_CONFIG.model,
            };
            
            set({
              llm: newLLMConfig,
              embedding: newEmbeddingConfig,
              general: {
                ...get().general,
                useGeneralKnowledge: config.useGeneralKnowledge ?? DEFAULT_GENERAL_SETTINGS.useGeneralKnowledge,
                documentRelevanceThreshold: config.documentRelevanceThreshold ?? DEFAULT_GENERAL_SETTINGS.documentRelevanceThreshold,
              },
              isConfigurationSaved: hasSavedConfig,
              hasUnsavedChanges: false,
              // Mark as already tested since config is saved and working
              llmTest: { status: 'success', message: 'Using saved configuration' },
              embeddingTest: { status: 'success', message: 'Using saved configuration' },
              validationErrors: [],
              isLoadingConfig: false,
            }, false, 'loadConfiguration:success');
          } else {
            // No config from backend - ensure we're in clean default state
            set({
              llm: { ...DEFAULT_LLM_CONFIG },
              embedding: { ...DEFAULT_EMBEDDING_CONFIG },
              general: { ...DEFAULT_GENERAL_SETTINGS },
              llmTest: { ...DEFAULT_TEST_RESULT },
              embeddingTest: { ...DEFAULT_TEST_RESULT },
              validationErrors: [],
              isConfigurationSaved: false,
              hasUnsavedChanges: false,
              isLoadingConfig: false,
            }, false, 'loadConfiguration:no-config');
          }
        } catch (error) {
          console.error('Failed to load configuration:', error);
          // On error, reset to defaults
          set({
            llm: { ...DEFAULT_LLM_CONFIG },
            embedding: { ...DEFAULT_EMBEDDING_CONFIG },
            llmTest: { ...DEFAULT_TEST_RESULT },
            embeddingTest: { ...DEFAULT_TEST_RESULT },
            validationErrors: [],
            isConfigurationSaved: false,
            hasUnsavedChanges: false,
            isLoadingConfig: false,
          }, false, 'loadConfiguration:error');
        }
      },
      
      // Actions - Reset
      resetTestResults: () => {
        set({
          llmTest: { ...DEFAULT_TEST_RESULT },
          embeddingTest: { ...DEFAULT_TEST_RESULT },
        }, false, 'resetTestResults');
      },
      
      clearValidationErrors: () => {
        set({ validationErrors: [] }, false, 'clearValidationErrors');
      },
    }),
    {
      name: 'settings-store',
      enabled: import.meta.env.DEV,
    }
  )
);
