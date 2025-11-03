"""Configuration manager for multi-provider LLM and embeddings support."""
import os
import json
from typing import Dict, Any, Optional, Literal
from pathlib import Path
from dataclasses import dataclass, asdict
from datetime import datetime

@dataclass
class LLMConfig:
    """LLM provider configuration."""
    provider: Literal["openai", "azure", "gemini"]
    api_key: str
    model: str
    # Azure-specific fields
    endpoint: Optional[str] = None
    deployment_name: Optional[str] = None
    # Common parameters
    temperature: float = 0.7
    max_tokens: int = 2000

@dataclass
class EmbeddingsConfig:
    """Embeddings provider configuration."""
    provider: Literal["openai", "azure"]
    api_key: str
    model: str
    # Azure-specific fields
    endpoint: Optional[str] = None
    deployment_name: Optional[str] = None

@dataclass
class AppConfig:
    """Complete application configuration."""
    llm: LLMConfig
    embeddings: EmbeddingsConfig
    useGeneralKnowledge: bool = True  # Allow AI to use general knowledge when no docs found
    documentRelevanceThreshold: float = 0.65  # Minimum relevance score for documents (0.0-1.0)
    updated_at: Optional[datetime] = None
    source: Literal["env", "ui"] = "env"

class ConfigurationManager:
    """Manages configuration with UI override priority over environment variables."""
    
    def __init__(self, config_file_path: str = "config/config.json"):
        self.config_file = Path(config_file_path)
        self._ui_config: Optional[AppConfig] = None
        self._env_config: Optional[AppConfig] = None
        self._current_config: Optional[AppConfig] = None
        
        # Load configurations
        self._load_env_config()
        self._load_ui_config()
        self._determine_active_config()
    
    def _load_env_config(self) -> None:
        """Load configuration from environment variables."""
        try:
            # Try to build LLM config from env
            llm_provider = "azure"  # Default to Azure since it's in env
            azure_key = os.getenv("AZURE_OPENAI_API_KEY")
            azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
            azure_deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME")
            
            if azure_key and azure_endpoint and azure_deployment:
                llm_config = LLMConfig(
                    provider="azure",
                    api_key=azure_key,
                    model=azure_deployment,
                    endpoint=azure_endpoint,
                    deployment_name=azure_deployment
                )
            else:
                # Fallback LLM config (will require UI configuration)
                llm_config = LLMConfig(
                    provider="azure",
                    api_key="",
                    model="gpt-4o"
                )
            
            # Try to build embeddings config from env
            embedding_deployment = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME")
            if azure_key and azure_endpoint and embedding_deployment:
                embeddings_config = EmbeddingsConfig(
                    provider="azure",
                    api_key=azure_key,
                    model=embedding_deployment,
                    endpoint=azure_endpoint,
                    deployment_name=embedding_deployment
                )
            else:
                # Fallback embeddings config
                embeddings_config = EmbeddingsConfig(
                    provider="azure",
                    api_key="",
                    model="text-embedding-3-large"
                )
            
            # Get useGeneralKnowledge from environment variable (default False)
            use_general_knowledge = os.getenv("USE_GENERAL_KNOWLEDGE", "false").lower() == "true"

            # Get documentRelevanceThreshold from environment variable (default 0.65)
            doc_threshold = float(os.getenv("DOCUMENT_RELEVANCE_THRESHOLD", "0.65"))

            self._env_config = AppConfig(
                llm=llm_config,
                embeddings=embeddings_config,
                useGeneralKnowledge=use_general_knowledge,
                documentRelevanceThreshold=doc_threshold,
                source="env"
            )
            print(f"[CONFIG] Loaded environment configuration: LLM={llm_config.provider}, Embeddings={embeddings_config.provider}, GeneralKnowledge={use_general_knowledge}")
            
        except Exception as e:
            print(f"[CONFIG] Warning: Failed to load environment config: {e}")
            # Create minimal fallback config
            self._env_config = AppConfig(
                llm=LLMConfig(provider="azure", api_key="", model="gpt-4o"),
                embeddings=EmbeddingsConfig(provider="azure", api_key="", model="text-embedding-3-large"),
                useGeneralKnowledge=True,
                source="env"
            )
    
    def _load_ui_config(self) -> None:
        """Load configuration from UI settings file."""
        try:
            if self.config_file.exists():
                with open(self.config_file, 'r') as f:
                    data = json.load(f)
                
                # Parse LLM config
                llm_data = data.get("llm", {})
                llm_config = LLMConfig(
                    provider=llm_data.get("provider", "azure"),
                    api_key=llm_data.get("api_key", ""),
                    model=llm_data.get("model", "gpt-4o"),
                    endpoint=llm_data.get("endpoint"),
                    deployment_name=llm_data.get("deployment_name"),
                    temperature=llm_data.get("temperature", 0.7),
                    max_tokens=llm_data.get("max_tokens", 2000)
                )
                
                # Parse embeddings config
                embeddings_data = data.get("embeddings", {})
                embeddings_config = EmbeddingsConfig(
                    provider=embeddings_data.get("provider", "azure"),
                    api_key=embeddings_data.get("api_key", ""),
                    model=embeddings_data.get("model", "text-embedding-3-large"),
                    endpoint=embeddings_data.get("endpoint"),
                    deployment_name=embeddings_data.get("deployment_name")
                )
                
                # Parse metadata
                updated_at_str = data.get("updated_at")
                updated_at = datetime.fromisoformat(updated_at_str) if updated_at_str else None
                
                # Parse useGeneralKnowledge (default True if not specified)
                use_general_knowledge = data.get("useGeneralKnowledge", True)

                # Parse documentRelevanceThreshold (default 0.65 if not specified)
                doc_threshold = data.get("documentRelevanceThreshold", 0.65)

                self._ui_config = AppConfig(
                    llm=llm_config,
                    embeddings=embeddings_config,
                    useGeneralKnowledge=use_general_knowledge,
                    documentRelevanceThreshold=doc_threshold,
                    updated_at=updated_at,
                    source="ui"
                )
                print(f"[CONFIG] Loaded UI configuration from {self.config_file}")
            else:
                print(f"[CONFIG] No UI configuration file found at {self.config_file}")
                
        except Exception as e:
            print(f"[CONFIG] Warning: Failed to load UI config: {e}")
            self._ui_config = None
    
    def _determine_active_config(self) -> None:
        """Determine which configuration to use based on priority: UI > env."""
        # If we have UI config, try to merge it with environment credentials
        if self._ui_config and self._env_config:
            # Use UI settings but fill in missing credentials from environment
            merged_config = self._merge_configs(self._ui_config, self._env_config)
            if self._is_valid_config(merged_config):
                self._current_config = merged_config
                print("[CONFIG] Using merged UI + environment configuration")
                return
        
        # Fallback to individual configs
        if self._ui_config and self._is_valid_config(self._ui_config):
            self._current_config = self._ui_config
            print("[CONFIG] Using UI configuration (priority)")
        elif self._env_config and self._is_valid_config(self._env_config):
            self._current_config = self._env_config
            print("[CONFIG] Using environment configuration (fallback)")
        else:
            print("[CONFIG] Warning: No valid configuration found")
            # Create minimal config that will require setup
            self._current_config = AppConfig(
                llm=LLMConfig(provider="azure", api_key="", model="gpt-4o"),
                embeddings=EmbeddingsConfig(provider="azure", api_key="", model="text-embedding-3-large"),
                useGeneralKnowledge=False,  # Default to False for minimal config
                documentRelevanceThreshold=0.65,  # Default threshold
                source="env"
            )
    
    def _merge_configs(self, ui_config: AppConfig, env_config: AppConfig) -> AppConfig:
        """Merge UI configuration with environment credentials."""
        # Start with UI config
        merged_llm = LLMConfig(
            provider=ui_config.llm.provider,
            api_key=ui_config.llm.api_key or env_config.llm.api_key,
            model=ui_config.llm.model,
            endpoint=ui_config.llm.endpoint or env_config.llm.endpoint,
            deployment_name=ui_config.llm.deployment_name or env_config.llm.deployment_name,
            temperature=ui_config.llm.temperature,
            max_tokens=ui_config.llm.max_tokens
        )
        
        merged_embeddings = EmbeddingsConfig(
            provider=ui_config.embeddings.provider,
            api_key=ui_config.embeddings.api_key or env_config.embeddings.api_key,
            model=ui_config.embeddings.model,
            endpoint=ui_config.embeddings.endpoint or env_config.embeddings.endpoint,
            deployment_name=ui_config.embeddings.deployment_name or env_config.embeddings.deployment_name
        )
        
        return AppConfig(
            llm=merged_llm,
            embeddings=merged_embeddings,
            useGeneralKnowledge=ui_config.useGeneralKnowledge,  # Always use UI setting
            documentRelevanceThreshold=ui_config.documentRelevanceThreshold,  # Always use UI setting
            updated_at=ui_config.updated_at,
            source="ui"  # Mark as UI since UI settings take priority
        )
    
    def _is_valid_config(self, config: AppConfig) -> bool:
        """Check if configuration has required fields."""
        try:
            # LLM validation
            if not config.llm.api_key:
                print("[CONFIG] LLM API key missing")
                return False
            
            if config.llm.provider == "azure":
                if not config.llm.endpoint:
                    print("[CONFIG] Azure LLM endpoint missing")
                    return False
                if not config.llm.deployment_name:
                    print("[CONFIG] Azure LLM deployment name missing")
                    return False
            
            # Embeddings validation
            if not config.embeddings.api_key:
                print("[CONFIG] Embeddings API key missing")
                return False
            
            if config.embeddings.provider == "azure":
                if not config.embeddings.endpoint:
                    print("[CONFIG] Azure embeddings endpoint missing")  
                    return False
                if not config.embeddings.deployment_name:
                    print("[CONFIG] Azure embeddings deployment name missing")
                    return False
            
            print("[CONFIG] Configuration validation passed")
            return True
        except Exception as e:
            print(f"[CONFIG] Validation error: {e}")
            return False
    
    def save_ui_config(self, config_data: Dict[str, Any]) -> bool:
        """Save configuration from UI."""
        try:
            # Build LLM config
            llm_config = LLMConfig(
                provider=config_data.get("llmProvider", "azure"),
                api_key=config_data.get(f"{config_data.get('llmProvider', 'azure')}ApiKey", ""),
                model=config_data.get(f"{config_data.get('llmProvider', 'azure')}Model", "gpt-4o"),
                endpoint=config_data.get("azureEndpoint") if config_data.get("llmProvider") == "azure" else None,
                deployment_name=config_data.get("azureDeploymentName") if config_data.get("llmProvider") == "azure" else None,
                temperature=config_data.get("temperature", 0.7),
                max_tokens=config_data.get("maxTokens", 2000)
            )
            
            # Build embeddings config
            embeddings_config = EmbeddingsConfig(
                provider=config_data.get("embeddingProvider", "azure"),
                api_key=config_data.get("embeddingApiKey", ""),
                model=config_data.get("embeddingModel", "text-embedding-3-large"),
                endpoint=config_data.get("embeddingEndpoint") if config_data.get("embeddingProvider") == "azure" else None,
                deployment_name=config_data.get("embeddingModel") if config_data.get("embeddingProvider") == "azure" else None
            )
            
            # Create new config
            new_config = AppConfig(
                llm=llm_config,
                embeddings=embeddings_config,
                useGeneralKnowledge=config_data.get("useGeneralKnowledge", True),
                documentRelevanceThreshold=config_data.get("documentRelevanceThreshold", 0.65),
                updated_at=datetime.now(),
                source="ui"
            )
            
            # Save to file
            config_dict = {
                "llm": {
                    "provider": llm_config.provider,
                    "api_key": llm_config.api_key,
                    "model": llm_config.model,
                    "endpoint": llm_config.endpoint,
                    "deployment_name": llm_config.deployment_name,
                    "temperature": llm_config.temperature,
                    "max_tokens": llm_config.max_tokens
                },
                "embeddings": {
                    "provider": embeddings_config.provider,
                    "api_key": embeddings_config.api_key,
                    "model": embeddings_config.model,
                    "endpoint": embeddings_config.endpoint,
                    "deployment_name": embeddings_config.deployment_name
                },
                "updated_at": new_config.updated_at.isoformat(),
                "source": "ui",
                "useGeneralKnowledge": new_config.useGeneralKnowledge,
                "documentRelevanceThreshold": new_config.documentRelevanceThreshold
            }
            
            # Ensure directory exists
            self.config_file.parent.mkdir(parents=True, exist_ok=True)
            
            with open(self.config_file, 'w') as f:
                json.dump(config_dict, f, indent=2)
            
            # Update internal state
            self._ui_config = new_config
            self._determine_active_config()
            
            # Debug: Log the current config after save
            current = self.get_current_config()
            print(f"[CONFIG] After save - useGeneralKnowledge: {current.useGeneralKnowledge}, threshold: {current.documentRelevanceThreshold}")
            
            print(f"[CONFIG] Saved UI configuration to {self.config_file}")
            return True
            
        except Exception as e:
            print(f"[CONFIG] Error saving UI config: {e}")
            return False
    
    def get_current_config(self) -> AppConfig:
        """Get the currently active configuration."""
        return self._current_config
    
    def get_config_for_frontend(self) -> Dict[str, Any]:
        """Get configuration data formatted for frontend display."""
        if not self._current_config:
            return {}
        
        config = self._current_config
        
        # Build response based on current config
        result = {
            "llmProvider": config.llm.provider,
            "embeddingProvider": config.embeddings.provider,
            "source": config.source,
            "isValid": self._is_valid_config(config),
            "useGeneralKnowledge": config.useGeneralKnowledge,
            "documentRelevanceThreshold": config.documentRelevanceThreshold
        }
        
        # Add provider-specific fields (don't expose full API keys for security)
        if config.llm.provider == "openai":
            result.update({
                "openaiApiKey": "***" if config.llm.api_key else "",
                "openaiModel": config.llm.model
            })
        elif config.llm.provider == "azure":
            result.update({
                "azureApiKey": "***" if config.llm.api_key else "",
                "azureEndpoint": config.llm.endpoint or "",
                "azureDeploymentName": config.llm.deployment_name or ""
            })
        elif config.llm.provider == "gemini":
            result.update({
                "geminiApiKey": "***" if config.llm.api_key else "",
                "geminiModel": config.llm.model
            })
        
        # Add embeddings info
        result.update({
            "embeddingApiKey": "***" if config.embeddings.api_key else "",
            "embeddingModel": config.embeddings.model,
            "useGeneralKnowledge": config.useGeneralKnowledge
        })
        
        if config.embeddings.provider == "azure":
            result["embeddingEndpoint"] = config.embeddings.endpoint or ""
        
        return result
    
    def is_configured(self) -> bool:
        """Check if the system is properly configured."""
        return self._current_config and self._is_valid_config(self._current_config)
    
    def reload_config(self) -> None:
        """Reload configuration from all sources."""
        self._load_env_config()
        self._load_ui_config()
        self._determine_active_config()

# Global configuration manager instance
config_manager = ConfigurationManager()