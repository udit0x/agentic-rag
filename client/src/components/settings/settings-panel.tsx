import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, X, Moon, Sun, Monitor, Keyboard, Zap, Info, Cog, Save, CheckCircle, Linkedin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import ShinyText from "@/components/ui/ShinyText";

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  settings: {
    enableTracing: boolean;
    debugMode: boolean;
    temperature: number;
    maxTokens: number;
    model: string;
    theme: "light" | "dark" | "system";
    enableAnimations: boolean;
    enableKeyboardShortcuts: boolean;
    useGeneralKnowledge: boolean;
    documentRelevanceThreshold: number;
    // LLM Configuration
    llmProvider: "openai" | "azure";
    openaiApiKey: string;
    openaiModel: string;
    azureApiKey: string;
    azureEndpoint: string;
    azureDeploymentName: string;
    // Embeddings Configuration
    embeddingProvider: "openai" | "azure";
    embeddingApiKey: string;
    embeddingEndpoint: string;
    embeddingModel: string;
  };
  onSettingsChange: (key: string, value: any) => void;
  onSaveConfiguration?: () => void;
}

export function SettingsPanel({ isOpen, onClose, settings, onSettingsChange, onSaveConfiguration }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<"general" | "configuration">("general");
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const isMobile = useIsMobile();

  const validateConfiguration = () => {
    const errors: Record<string, string> = {};

    // Only validate LLM API keys if the user is trying to save a new LLM configuration
    // For existing configured systems, we might allow settings-only updates
    
    // Validate LLM configuration - only if switching to a new provider or no key is set
    if (settings.llmProvider === "openai" && !settings.openaiApiKey.trim()) {
      errors.openaiApiKey = "OpenAI API key is required";
    }
    if (settings.llmProvider === "azure") {
      if (!settings.azureApiKey.trim()) errors.azureApiKey = "Azure API key is required";
      if (!settings.azureEndpoint.trim()) errors.azureEndpoint = "Azure endpoint is required";
      if (!settings.azureDeploymentName.trim()) errors.azureDeploymentName = "Azure deployment name is required";
    }

    // Validate embeddings configuration - always required since embeddings are core functionality
    if (!settings.embeddingApiKey.trim()) {
      errors.embeddingApiKey = `${settings.embeddingProvider === "azure" ? "Azure" : "OpenAI"} API key is required for embeddings`;
    }
    if (settings.embeddingProvider === "azure" && !settings.embeddingEndpoint.trim()) {
      errors.embeddingEndpoint = "Azure endpoint is required for embeddings";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveConfiguration = () => {
    if (validateConfiguration()) {
      onSaveConfiguration?.();
    }
  };

  const handleProviderChange = (provider: string, type: 'llm' | 'embedding') => {
    if (type === 'llm') {
      onSettingsChange('llmProvider', provider);
    } else {
      onSettingsChange('embeddingProvider', provider);
    }
    
    // Clear validation errors when provider changes to give user a fresh start
    setValidationErrors({});
  };

  const tabs = [
    { id: "general", label: "General", icon: Settings },
    { id: "configuration", label: "Configuration", icon: Cog }
  ];

  const themeIcons = {
    light: Sun,
    dark: Moon,
    system: Monitor,
  };

  const ThemeIcon = themeIcons[settings.theme];

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
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors relative ${
                      activeTab === tab.id
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <tab.icon className="h-4 w-4" />
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
                                checked={settings.useGeneralKnowledge}
                                onCheckedChange={(checked) => onSettingsChange("useGeneralKnowledge", checked)}
                              />
                            </div>

                            <div className="space-y-3">
                              <div className="space-y-2">
                                <Label htmlFor="document-relevance-threshold">
                                  Document Relevance Threshold: {(settings.documentRelevanceThreshold * 100).toFixed(0)}%
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
                                value={[settings.documentRelevanceThreshold]}
                                onValueChange={([value]) => onSettingsChange("documentRelevanceThreshold", value)}
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
                                  checked={settings.enableTracing}
                                  onCheckedChange={(checked) => onSettingsChange("enableTracing", checked)}
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
                                value={settings.llmProvider}
                                onValueChange={(value) => handleProviderChange(value, 'llm')}
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

                            {settings.llmProvider === "openai" && (
                              <>
                                <div className="space-y-2">
                                  <Label htmlFor="openai-api-key">API Key</Label>
                                  <Input
                                    id="openai-api-key"
                                    type="password"
                                    placeholder="Enter the OpenAI API key"
                                    value={settings.openaiApiKey}
                                    onChange={(e) => onSettingsChange("openaiApiKey", e.target.value)}
                                    className={validationErrors.openaiApiKey ? "border-red-500 focus:border-red-500" : ""}
                                  />
                                  {validationErrors.openaiApiKey && (
                                    <p className="text-xs text-red-500">{validationErrors.openaiApiKey}</p>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="openai-model">Model</Label>
                                  <Select
                                    value={settings.openaiModel}
                                    onValueChange={(value) => onSettingsChange("openaiModel", value)}
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

                            {settings.llmProvider === "azure" && (
                              <>
                                <div className="space-y-2">
                                  <Label htmlFor="azure-api-key">API Key</Label>
                                  <Input
                                    id="azure-api-key"
                                    type="password"
                                    placeholder="Enter Azure API key"
                                    value={settings.azureApiKey}
                                    onChange={(e) => onSettingsChange("azureApiKey", e.target.value)}
                                    className={validationErrors.azureApiKey ? "border-red-500 focus:border-red-500" : ""}
                                  />
                                  {validationErrors.azureApiKey && (
                                    <p className="text-xs text-red-500">{validationErrors.azureApiKey}</p>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="azure-endpoint">Endpoint</Label>
                                  <Input
                                    id="azure-endpoint"
                                    placeholder="https://your-resource.openai.azure.com/"
                                    value={settings.azureEndpoint}
                                    onChange={(e) => onSettingsChange("azureEndpoint", e.target.value)}
                                    className={validationErrors.azureEndpoint ? "border-red-500 focus:border-red-500" : ""}
                                  />
                                  {validationErrors.azureEndpoint && (
                                    <p className="text-xs text-red-500">{validationErrors.azureEndpoint}</p>
                                  )}
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="azure-deployment">Deployment Name</Label>
                                  <Input
                                    id="azure-deployment"
                                    placeholder="gpt-4o"
                                    value={settings.azureDeploymentName}
                                    onChange={(e) => onSettingsChange("azureDeploymentName", e.target.value)}
                                    className={validationErrors.azureDeploymentName ? "border-red-500 focus:border-red-500" : ""}
                                  />
                                  {validationErrors.azureDeploymentName && (
                                    <p className="text-xs text-red-500">{validationErrors.azureDeploymentName}</p>
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
                                value={settings.embeddingProvider}
                                onValueChange={(value) => handleProviderChange(value, 'embedding')}
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
                              <Input
                                id="embedding-api-key"
                                type="password"
                                placeholder={settings.embeddingProvider === "azure" ? "Azure API key" : "OpenAI API key"}
                                value={settings.embeddingApiKey}
                                onChange={(e) => onSettingsChange("embeddingApiKey", e.target.value)}
                                className={validationErrors.embeddingApiKey ? "border-red-500 focus:border-red-500" : ""}
                              />
                              {validationErrors.embeddingApiKey && (
                                <p className="text-xs text-red-500">{validationErrors.embeddingApiKey}</p>
                              )}
                            </div>

                            {settings.embeddingProvider === "azure" && (
                              <div className="space-y-2">
                                <Label htmlFor="embedding-endpoint">Endpoint</Label>
                                <Input
                                  id="embedding-endpoint"
                                  placeholder="https://your-resource.openai.azure.com/"
                                  value={settings.embeddingEndpoint}
                                  onChange={(e) => onSettingsChange("embeddingEndpoint", e.target.value)}
                                  className={validationErrors.embeddingEndpoint ? "border-red-500 focus:border-red-500" : ""}
                                />
                                {validationErrors.embeddingEndpoint && (
                                  <p className="text-xs text-red-500">{validationErrors.embeddingEndpoint}</p>
                                )}
                              </div>
                            )}

                            <div className="space-y-2">
                              <Label htmlFor="embedding-model">Model</Label>
                              <Select
                                value={settings.embeddingModel}
                                onValueChange={(value) => onSettingsChange("embeddingModel", value)}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select embedding model" />
                                </SelectTrigger>
                                <SelectContent>
                                  {settings.embeddingProvider === "azure" ? (
                                    <>
                                      <SelectItem value="text-embedding-3-large">text-embedding-3-large</SelectItem>
                                      <SelectItem value="text-embedding-3-small">text-embedding-3-small</SelectItem>
                                      <SelectItem value="text-embedding-ada-002">text-embedding-ada-002</SelectItem>
                                    </>
                                  ) : (
                                    <>
                                      <SelectItem value="text-embedding-3-large">text-embedding-3-large</SelectItem>
                                      <SelectItem value="text-embedding-3-small">text-embedding-3-small</SelectItem>
                                      <SelectItem value="text-embedding-ada-002">text-embedding-ada-002</SelectItem>
                                    </>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>
                          </CardContent>
                        </Card>

                        {/* Save Configuration Button */}
                        <div className="flex justify-end pt-4 border-t border-border">
                          <Button 
                            onClick={handleSaveConfiguration}
                            className="flex items-center gap-2"
                            size="default"
                          >
                            <Save className="h-4 w-4" />
                            Save Configuration
                          </Button>
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
                  >
                    <ShinyText 
                      text="Udit Kashyap" 
                      disabled={false} 
                      speed={3} 
                      className="text-sm" 
                    />
                    <Linkedin className="h-3 w-3 text-primary" />
                  </a>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}