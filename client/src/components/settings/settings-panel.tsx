import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, X, Moon, Sun, Monitor, Cog, Save, Trash2, Loader2, Eye, EyeOff, Zap, Info, CheckCircle2, XCircle, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { useQuotaStore } from "@/stores/quota-store";
import { useSettingsStore } from "@/stores/settings-store";
import ShinyText from "@/components/ui/ShinyText";
import Lottie from "lottie-react";
import settingsAnimation from "@/assets/animations/settingsV2.json";
import linkedinAnimation from "@/assets/animations/linkedin.json";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<"general" | "configuration">("general");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({
    openaiApiKey: false,
    azureApiKey: false,
    embeddingApiKey: false,
  });
  const isMobile = useIsMobile();
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);
  const [animationKey, setAnimationKey] = useState(0);
  const [linkedinHovered, setLinkedinHovered] = useState(false);
  const { toast } = useToast();
  
  // Debounced threshold save
  const [thresholdSaveTimeout, setThresholdSaveTimeout] = useState<NodeJS.Timeout | null>(null);
  
  // Quota state for mobile display
  const { quotaRemaining, isUnlimited, hasPersonalKey, getQuotaStatus } = useQuotaStore();
  const quotaStatus = getQuotaStatus();

  // Settings store - SINGLE SOURCE OF TRUTH
  const {
    llm,
    embedding,
    general,
    llmTest,
    embeddingTest,
    validationErrors,
    isSaving,
    isDeleting,
    isTesting,
    canSave,
    canTest,
    isConfigurationSaved,
    setLLMProvider,
    setLLMField,
    setEmbeddingProvider,
    setEmbeddingField,
    setGeneralSetting,
    testConfiguration,
    saveConfiguration,
    deleteConfiguration,
    resetTestResults,
    loadConfiguration,
  } = useSettingsStore();

  // Load configuration when panel opens
  useEffect(() => {
    if (isOpen) {
      loadConfiguration();
    }
  }, [isOpen]); // Only depend on isOpen, not loadConfiguration

  const togglePasswordVisibility = (field: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const handleTest = async () => {
    await testConfiguration();
  };

  const handleSave = async () => {
    try {
      await saveConfiguration();
      toast({
        title: "Configuration saved",
        description: "Your API keys and settings have been securely saved.",
      });
    } catch (error) {
      toast({
        title: "Failed to save configuration",
        description: "There was an error saving your configuration. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    setShowDeleteDialog(false);
    try {
      await deleteConfiguration();
      toast({
        title: "Configuration removed",
        description: "Your API keys have been removed. You'll use the free tier with quota limits.",
      });
    } catch (error) {
      toast({
        title: "Failed to remove configuration",
        description: "There was an error removing your configuration. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getValidationError = (field: string): string | undefined => {
    return validationErrors.find(e => e.field === field)?.message;
  };

  const hasAnyConfiguration = isConfigurationSaved || !!(llm.openaiApiKey || llm.azureApiKey || embedding.apiKey);

  const tabs = [
    { id: "general", label: "General", icon: Settings, useAnimation: true },
    { id: "configuration", label: "Configuration", icon: Cog, useAnimation: false }
  ];

  const themeIcons = {
    light: Sun,
    dark: Moon,
    system: Monitor,
  };

  const ThemeIcon = themeIcons[general.theme];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-40"
            onClick={onClose}
          />

          {/* Settings Panel */}
          <motion.div
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-96 bg-background border-l border-border z-50 overflow-hidden"
          >
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="text-lg font-semibold">Settings</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-border">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    onMouseEnter={() => {
                      setHoveredTab(tab.id);
                      if (tab.useAnimation) {
                        setAnimationKey(prev => prev + 1);
                      }
                    }}
                    onMouseLeave={() => setHoveredTab(null)}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors relative ${
                      activeTab === tab.id
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.useAnimation ? (
                      <div className="[&_svg_path]:stroke-foreground [&_svg_path]:fill-none">
                        <Lottie
                          key={animationKey}
                          animationData={settingsAnimation}
                          loop={false}
                          autoplay={true}
                          style={{ width: 16, height: 16 }}
                          rendererSettings={{
                            preserveAspectRatio: 'xMidYMid meet',
                          }}
                        />
                      </div>
                    ) : (
                      <tab.icon className="h-4 w-4" />
                    )}
                    <span className="hidden sm:block">{tab.label}</span>
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-4">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-6"
                  >
                    {activeTab === "general" && (
                      <>
                        {/* Quota Card - Mobile Only */}
                        {isMobile && !isUnlimited && !hasPersonalKey && (
                          <Card>
                            <CardContent className="pt-4 pb-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium">Message Quota</span>
                                <Badge 
                                  variant={quotaStatus === 'exhausted' ? 'destructive' : 'secondary'}
                                  className={quotaStatus === 'low' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : ''}
                                >
                                  {quotaRemaining} remaining
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {quotaStatus === 'exhausted' 
                                  ? "Add your API key to continue chatting."
                                  : quotaStatus === 'low'
                                    ? "Running low. Consider adding your API key."
                                    : `${quotaRemaining} messages in your free tier.`
                                }
                              </p>
                            </CardContent>
                          </Card>
                        )}
                        
                        {isMobile && (isUnlimited || hasPersonalKey) && (
                          <Card>
                            <CardContent className="pt-4 pb-3">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium">Message Quota</span>
                                <Badge variant="secondary">
                                  {isUnlimited ? "Unlimited" : "Your Key"}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {hasPersonalKey 
                                  ? "Using your personal API key."
                                  : "Unlimited messages available."
                                }
                              </p>
                            </CardContent>
                          </Card>
                        )}

                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base">Knowledge</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="space-y-1">
                                <Label htmlFor="use-general-knowledge">Use General Knowledge</Label>
                                <p className="text-xs text-muted-foreground">
                                  Allow the AI to use its built-in knowledge when no relevant documents are found
                                </p>
                              </div>
                              <Switch
                                id="use-general-knowledge"
                                checked={general.useGeneralKnowledge}
                                onCheckedChange={async (checked) => {
                                  await setGeneralSetting("useGeneralKnowledge", checked);
                                  toast({
                                    title: `General knowledge ${checked ? 'enabled' : 'disabled'}`,
                                    description: `The AI ${checked ? 'can now' : 'can no longer'} use its built-in knowledge when no relevant documents are found.`,
                                  });
                                }}
                              />
                            </div>

                            <div className="space-y-3">
                              <div className="space-y-2">
                                <Label htmlFor="document-relevance-threshold">
                                  Document Relevance Threshold: {(general.documentRelevanceThreshold * 100).toFixed(0)}%
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                  Adjust how selective the model is when retrieving context.
                                </p>
                              </div>
                              <Slider
                                id="document-relevance-threshold"
                                min={0.1}
                                max={0.95}
                                step={0.05}
                                value={[general.documentRelevanceThreshold]}
                                onValueChange={([value]) => {
                                  // Update UI immediately
                                  setGeneralSetting("documentRelevanceThreshold", value);
                                  
                                  // Debounce the toast to avoid spam
                                  if (thresholdSaveTimeout) {
                                    clearTimeout(thresholdSaveTimeout);
                                  }
                                  
                                  const timeout = setTimeout(() => {
                                    toast({
                                      title: "Threshold updated",
                                      description: `Document relevance threshold set to ${(value * 100).toFixed(0)}%`,
                                    });
                                  }, 500);
                                  
                                  setThresholdSaveTimeout(timeout);
                                }}
                                className="w-full"
                              />
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <div className="text-left">
                                  <p className="font-medium text-foreground">Lower (10%)</p>
                                  <p>More context chunks, broader responses</p>
                                </div>

                                <div className="text-right">
                                  <p className="font-medium text-foreground">Higher (95%)</p>
                                  <p>Fewer chunks, highly focused answers</p>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        {!isMobile && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base">Agent Behavior</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">                            
                              <div className="flex items-center justify-between">
                                <div className="space-y-1">
                                  <Label htmlFor="enable-tracing">Agent Tracing</Label>
                                  <p className="text-xs text-muted-foreground">
                                    Show step-by-step agent execution
                                  </p>
                                </div>
                                <Switch
                                  id="enable-tracing"
                                  checked={general.enableTracing}
                                  onCheckedChange={(checked) => setGeneralSetting("enableTracing", checked)}
                                />
                              </div>
                          </CardContent>
                        </Card>
                         )}
                      </>
                    )}

                    {activeTab === "configuration" && (
                      <>
                        {/* Security Notice */}
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border border-border">
                          <Info className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                          <p className="text-xs text-muted-foreground">
                            All API keys are encrypted and stored securely. This is an open-source project committed to your data privacy.
                          </p>
                        </div>

                        {/* LLM Configuration Card */}
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base">LLM Configuration</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="llm-provider">LLM Provider</Label>
                              <Select
                                value={llm.provider}
                                onValueChange={(value) => setLLMProvider(value as 'openai' | 'azure')}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select LLM provider" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="openai">OpenAI</SelectItem>
                                  <SelectItem value="azure">Azure OpenAI</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {llm.provider === "openai" && (
                              <>
                                <div className="space-y-2">
                                  <Label htmlFor="openai-api-key">API Key</Label>
                                  <div className="relative">
                                    <Input
                                      id="openai-api-key"
                                      type={showPasswords.openaiApiKey ? "text" : "password"}
                                      placeholder="Enter the OpenAI API key"
                                      value={llm.openaiApiKey}
                                      onChange={(e) => setLLMField("openaiApiKey", e.target.value)}
                                      className={getValidationError("openaiApiKey") ? "border-red-500 focus:border-red-500 pr-10" : "pr-10"}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => togglePasswordVisibility('openaiApiKey')}
                                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      {showPasswords.openaiApiKey ? (
                                        <EyeOff className="h-4 w-4" />
                                      ) : (
                                        <Eye className="h-4 w-4" />
                                      )}
                                    </button>
                                  </div>
                                  {getValidationError("openaiApiKey") && (
                                    <p className="text-xs text-red-500">{getValidationError("openaiApiKey")}</p>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="openai-model">Model</Label>
                                  <Select
                                    value={llm.openaiModel}
                                    onValueChange={(value) => setLLMField("openaiModel", value)}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select model" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                                      <SelectItem value="gpt-4o-mini">GPT-4o Mini</SelectItem>
                                      <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                                      <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </>
                            )}

                            {llm.provider === "azure" && (
                              <>
                                <div className="space-y-2">
                                  <Label htmlFor="azure-api-key">API Key</Label>
                                  <div className="relative">
                                    <Input
                                      id="azure-api-key"
                                      type={showPasswords.azureApiKey ? "text" : "password"}
                                      placeholder="Enter Azure API key"
                                      value={llm.azureApiKey}
                                      onChange={(e) => setLLMField("azureApiKey", e.target.value)}
                                      className={getValidationError("azureApiKey") ? "border-red-500 focus:border-red-500 pr-10" : "pr-10"}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => togglePasswordVisibility('azureApiKey')}
                                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      {showPasswords.azureApiKey ? (
                                        <EyeOff className="h-4 w-4" />
                                      ) : (
                                        <Eye className="h-4 w-4" />
                                      )}
                                    </button>
                                  </div>
                                  {getValidationError("azureApiKey") && (
                                    <p className="text-xs text-red-500">{getValidationError("azureApiKey")}</p>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="azure-endpoint">Endpoint</Label>
                                  <Input
                                    id="azure-endpoint"
                                    placeholder="https://your-resource.openai.azure.com/"
                                    value={llm.azureEndpoint}
                                    onChange={(e) => setLLMField("azureEndpoint", e.target.value)}
                                    className={getValidationError("azureEndpoint") ? "border-red-500 focus:border-red-500" : ""}
                                  />
                                  {getValidationError("azureEndpoint") && (
                                    <p className="text-xs text-red-500">{getValidationError("azureEndpoint")}</p>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="azure-deployment">Deployment Name</Label>
                                  <Input
                                    id="azure-deployment"
                                    placeholder="gpt-4o"
                                    value={llm.azureDeploymentName}
                                    onChange={(e) => setLLMField("azureDeploymentName", e.target.value)}
                                    className={getValidationError("azureDeploymentName") ? "border-red-500 focus:border-red-500" : ""}
                                  />
                                  {getValidationError("azureDeploymentName") && (
                                    <p className="text-xs text-red-500">{getValidationError("azureDeploymentName")}</p>
                                  )}
                                </div>
                              </>
                            )}
                          </CardContent>
                        </Card>

                        {/* Embeddings Configuration Card */}
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base">Embeddings Configuration</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="embedding-provider">Embeddings Provider</Label>
                              <Select
                                value={embedding.provider}
                                onValueChange={(value) => setEmbeddingProvider(value as 'openai' | 'azure')}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select embeddings provider" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="openai">OpenAI</SelectItem>
                                  <SelectItem value="azure">Azure OpenAI</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="embedding-api-key">API Key</Label>
                              <div className="relative">
                                <Input
                                  id="embedding-api-key"
                                  type={showPasswords.embeddingApiKey ? "text" : "password"}
                                  placeholder={embedding.provider === "azure" ? "Azure API key" : "OpenAI API key"}
                                  value={embedding.apiKey}
                                  onChange={(e) => setEmbeddingField("apiKey", e.target.value)}
                                  className={getValidationError("embeddingApiKey") ? "border-red-500 focus:border-red-500 pr-10" : "pr-10"}
                                />
                                <button
                                  type="button"
                                  onClick={() => togglePasswordVisibility('embeddingApiKey')}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  {showPasswords.embeddingApiKey ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </button>
                              </div>
                              {getValidationError("embeddingApiKey") && (
                                <p className="text-xs text-red-500">{getValidationError("embeddingApiKey")}</p>
                              )}
                            </div>

                            {embedding.provider === "azure" && (
                              <div className="space-y-2">
                                <Label htmlFor="embedding-endpoint">Endpoint</Label>
                                <Input
                                  id="embedding-endpoint"
                                  placeholder="https://your-resource.openai.azure.com/"
                                  value={embedding.endpoint}
                                  onChange={(e) => setEmbeddingField("endpoint", e.target.value)}
                                  className={getValidationError("embeddingEndpoint") ? "border-red-500 focus:border-red-500" : ""}
                                />
                                {getValidationError("embeddingEndpoint") && (
                                  <p className="text-xs text-red-500">{getValidationError("embeddingEndpoint")}</p>
                                )}
                              </div>
                            )}

                            <div className="space-y-2">
                              <Label htmlFor="embedding-model">Model</Label>
                              <Select
                                value={embedding.model}
                                onValueChange={(value) => setEmbeddingField("model", value)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select embedding model" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="text-embedding-3-large">text-embedding-3-large</SelectItem>
                                  <SelectItem value="text-embedding-3-small">text-embedding-3-small</SelectItem>
                                  <SelectItem value="text-embedding-ada-002">text-embedding-ada-002</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </CardContent>
                        </Card>

                        {/* Test Results - Minimal Design */}
                        {(llmTest.status !== 'idle' || embeddingTest.status !== 'idle') && (
                          <div className="relative border border-border rounded-lg bg-background/50 backdrop-blur-sm">
                            <button
                              onClick={resetTestResults}
                              className="absolute top-2 right-2 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                              aria-label="Dismiss test results"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                            <div className="pt-3 pb-3 px-4 pr-8 space-y-2">
                              {llmTest.message && (
                                <div className="flex items-center gap-2.5">
                                  {llmTest.status === 'testing' ? (
                                    <Circle className="h-3.5 w-3.5 text-muted-foreground animate-pulse" />
                                  ) : llmTest.status === 'success' ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-foreground/80" />
                                  ) : (
                                    <XCircle className="h-3.5 w-3.5 text-foreground/80" />
                                  )}
                                  <span className={`text-xs font-medium ${
                                    llmTest.status === 'error' ? 'text-foreground/70' : 'text-foreground/80'
                                  }`}>
                                    {llmTest.message}
                                  </span>
                                </div>
                              )}
                              {embeddingTest.message && (
                                <div className="flex items-center gap-2.5">
                                  {embeddingTest.status === 'testing' ? (
                                    <Circle className="h-3.5 w-3.5 text-muted-foreground animate-pulse" />
                                  ) : embeddingTest.status === 'success' ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-foreground/80" />
                                  ) : (
                                    <XCircle className="h-3.5 w-3.5 text-foreground/80" />
                                  )}
                                  <span className={`text-xs font-medium ${
                                    embeddingTest.status === 'error' ? 'text-foreground/70' : 'text-foreground/80'
                                  }`}>
                                    {embeddingTest.message}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="space-y-2.5 pt-2">
                          {/* Test Button - Full Width */}
                          <Button 
                            onClick={handleTest}
                            variant="outline"
                            disabled={!canTest()}
                            className="w-full flex items-center justify-center gap-2"
                            size="sm"
                          >
                            {isTesting ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Zap className="h-4 w-4" />
                            )}
                            <span className="text-sm">{isTesting ? "Testing..." : "Test Configuration"}</span>
                          </Button>
                          
                          {/* Save and Delete Buttons - Side by Side */}
                          <div className="grid grid-cols-2 gap-2.5">
                            <Button 
                              onClick={() => setShowDeleteDialog(true)}
                              variant="outline"
                              disabled={!hasAnyConfiguration || isDeleting || isSaving || isTesting}
                              className="flex items-center justify-center gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed"
                              size="sm"
                            >
                              {isDeleting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                              <span className="text-sm">{isDeleting ? "Deleting..." : "Delete"}</span>
                            </Button>
                            
                            <Button 
                              onClick={handleSave}
                              disabled={!canSave()}
                              className="flex items-center justify-center gap-2"
                              size="sm"
                            >
                              {isSaving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                              <span className="text-sm">{isSaving ? "Saving..." : "Save"}</span>
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Built By Footer */}
              <div className="p-4 border-t border-border">
                <div className="flex items-center justify-center space-x-2 text-sm">
                  <span className="text-muted-foreground">Built by:</span>
                  <a
                    href="https://www.linkedin.com/in/udit-kashyap-219a70133/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-1 hover:opacity-80 transition-opacity"
                    onMouseEnter={() => setLinkedinHovered(true)}
                    onMouseLeave={() => setLinkedinHovered(false)}
                  >
                    <ShinyText 
                      text="Udit Kashyap" 
                      disabled={false} 
                      speed={3} 
                      className="text-sm"
                    />
                    <div className="[&_svg_path]:stroke-primary [&_svg_path]:fill-none">
                      <Lottie
                        animationData={linkedinAnimation}
                        loop={linkedinHovered}
                        autoplay={linkedinHovered}
                        style={{ width: 16, height: 16 }}
                        rendererSettings={{
                          preserveAspectRatio: 'xMidYMid meet',
                        }}
                      />
                    </div>
                  </a>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Delete Configuration Confirmation Dialog */}
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove API Configuration?</AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <span className="block">
                    This will remove all your saved API keys and configuration settings.
                  </span>
                  <span className="block font-medium text-foreground">
                    {quotaRemaining > 0 
                      ? `You'll fallback to the free tier with ${quotaRemaining} messages remaining.`
                      : "You'll fallback to the free tier, but you've exhausted your quota. You'll need to wait for a reset or add a new API key to continue."
                    }
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none"
                >
                  Remove Configuration
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </AnimatePresence>
  );
}
