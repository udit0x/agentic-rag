"""Multi-provider LLM and embeddings factory."""
from typing import Optional, Union
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.embeddings import Embeddings
from langchain_openai import ChatOpenAI, AzureChatOpenAI, OpenAIEmbeddings, AzureOpenAIEmbeddings
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from server.config_manager import config_manager, LLMConfig, EmbeddingsConfig

class LLMProviderFactory:
    """Factory for creating LLM instances based on configuration."""
    
    @staticmethod
    def create_llm(config: Optional[LLMConfig] = None) -> BaseChatModel:
        """Create LLM instance based on configuration."""
        if config is None:
            app_config = config_manager.get_current_config()
            config = app_config.llm if app_config else None
        
        if not config or not config.api_key:
            raise ValueError("LLM configuration is missing or incomplete")
        
        print(f"[LLM_FACTORY] Creating {config.provider} LLM with model {config.model}")
        
        if config.provider == "openai":
            return ChatOpenAI(
                api_key=config.api_key,
                model=config.model,
                temperature=config.temperature,
                max_tokens=config.max_tokens,
            )
        
        elif config.provider == "azure":
            if not config.endpoint or not config.deployment_name:
                raise ValueError("Azure LLM requires endpoint and deployment_name")
            
            return AzureChatOpenAI(
                api_key=config.api_key,
                azure_endpoint=config.endpoint,
                azure_deployment=config.deployment_name,
                api_version="2024-02-01",
                temperature=config.temperature,
                max_tokens=config.max_tokens,
            )
        else:
            raise ValueError(f"Unsupported LLM provider: {config.provider}")

class EmbeddingsProviderFactory:
    """Factory for creating embeddings instances based on configuration."""
    
    @staticmethod
    def create_embeddings(config: Optional[EmbeddingsConfig] = None) -> Embeddings:
        """Create embeddings instance based on configuration."""
        if config is None:
            app_config = config_manager.get_current_config()
            config = app_config.embeddings if app_config else None
        
        if not config or not config.api_key:
            raise ValueError("Embeddings configuration is missing or incomplete")
        
        print(f"[EMBEDDINGS_FACTORY] Creating {config.provider} embeddings with model {config.model}")
        
        if config.provider == "openai":
            return OpenAIEmbeddings(
                api_key=config.api_key,
                model=config.model,
            )
        
        elif config.provider == "azure":
            if not config.endpoint or not config.deployment_name:
                raise ValueError("Azure embeddings requires endpoint and deployment_name")
            
            return AzureOpenAIEmbeddings(
                api_key=config.api_key,
                azure_endpoint=config.endpoint,
                azure_deployment=config.deployment_name,
                api_version="2024-02-01",
            )
        
        else:
            raise ValueError(f"Unsupported embeddings provider: {config.provider}")

# Singleton instances that are created on-demand with config tracking
_llm_instance: Optional[BaseChatModel] = None
_embeddings_instance: Optional[Embeddings] = None
_cached_llm_config_hash: Optional[str] = None
_cached_embeddings_config_hash: Optional[str] = None

def _get_config_hash(config) -> str:
    """Generate hash of config for cache invalidation."""
    if not config:
        return "none"
    
    # Create a simple hash from key config properties
    config_str = f"{config.provider}:{config.model}:{config.api_key[:8] if config.api_key else 'none'}"
    if hasattr(config, 'endpoint'):
        config_str += f":{config.endpoint}"
    if hasattr(config, 'deployment_name'):
        config_str += f":{config.deployment_name}"
    
    return str(hash(config_str))

def get_llm() -> BaseChatModel:
    """Get the current LLM instance, creating it if necessary."""
    global _llm_instance, _cached_llm_config_hash
    
    # Get current config and hash
    current_config = config_manager.get_current_config()
    llm_config = current_config.llm if current_config else None
    current_hash = _get_config_hash(llm_config)
    
    # Only recreate if config actually changed
    if _llm_instance is None or _cached_llm_config_hash != current_hash:
        _llm_instance = LLMProviderFactory.create_llm()
        _cached_llm_config_hash = current_hash
        print(f"[PROVIDER] Created new LLM instance: {type(_llm_instance).__name__}")
    else:
        # Reusing cached instance
        pass
    
    return _llm_instance

def get_embeddings() -> Embeddings:
    """Get the current embeddings instance, creating it if necessary."""
    global _embeddings_instance, _cached_embeddings_config_hash
    
    # Get current config and hash
    current_config = config_manager.get_current_config()
    embeddings_config = current_config.embeddings if current_config else None
    current_hash = _get_config_hash(embeddings_config)
    
    # Only recreate if config actually changed
    if _embeddings_instance is None or _cached_embeddings_config_hash != current_hash:
        _embeddings_instance = EmbeddingsProviderFactory.create_embeddings()
        _cached_embeddings_config_hash = current_hash
        print(f"[PROVIDER] Created new embeddings instance: {type(_embeddings_instance).__name__}")
    else:
        # Reusing cached instance
        pass
    
    return _embeddings_instance

def reset_providers():
    """Reset provider instances (useful when configuration changes)."""
    global _llm_instance, _embeddings_instance, _cached_llm_config_hash, _cached_embeddings_config_hash
    _llm_instance = None
    _embeddings_instance = None
    _cached_llm_config_hash = None
    _cached_embeddings_config_hash = None
    print("[PROVIDER] Reset all provider instances")

def validate_current_config() -> tuple[bool, list[str]]:
    """Validate the current configuration and return status and errors."""
    errors = []
    
    try:
        current_config = config_manager.get_current_config()
        if not current_config:
            errors.append("No configuration found")
            return False, errors
        
        # Validate LLM config
        try:
            llm = LLMProviderFactory.create_llm(current_config.llm)
            # Test basic functionality with a simple prompt
            # Note: This doesn't make an actual API call, just validates configuration
        except Exception as e:
            errors.append(f"LLM configuration error: {str(e)}")
        
        # Validate embeddings config
        try:
            embeddings = EmbeddingsProviderFactory.create_embeddings(current_config.embeddings)
            # Test basic functionality
            # Note: This doesn't make an actual API call, just validates configuration
        except Exception as e:
            errors.append(f"Embeddings configuration error: {str(e)}")
        
        return len(errors) == 0, errors
        
    except Exception as e:
        errors.append(f"General configuration error: {str(e)}")
        return False, errors