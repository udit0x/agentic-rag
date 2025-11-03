"""Configuration API endpoints."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from server.config_manager import config_manager

router = APIRouter(prefix="/api/config", tags=["configuration"])

class ConfigSaveRequest(BaseModel):
    llmProvider: str
    openaiApiKey: str = ""
    openaiModel: str = "gpt-4o"
    azureApiKey: str = ""
    azureEndpoint: str = ""
    azureDeploymentName: str = ""
    geminiApiKey: str = ""
    geminiModel: str = "gemini-1.5-pro"
    embeddingProvider: str
    embeddingApiKey: str = ""
    embeddingEndpoint: str = ""
    embeddingModel: str = "text-embedding-3-large"
    useGeneralKnowledge: bool = True
    documentRelevanceThreshold: float = 0.65

class ConfigResponse(BaseModel):
    success: bool
    message: str
    config: Dict[str, Any] = {}

@router.get("/current", response_model=ConfigResponse)
async def get_current_config():
    """Get the current configuration for display in UI."""
    try:
        config_data = config_manager.get_config_for_frontend()
        
        return ConfigResponse(
            success=True,
            message="Configuration retrieved successfully",
            config=config_data
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve configuration: {str(e)}"
        )

@router.post("/save", response_model=ConfigResponse)
async def save_configuration(request: ConfigSaveRequest):
    """Save configuration from UI."""
    try:
        # Convert request to dict for config manager
        config_data = request.dict()
        
        # Check if this is a settings-only update (e.g., just useGeneralKnowledge toggle)
        current_config = config_manager.get_current_config()
        
        # If we have environment credentials available, allow settings-only updates
        has_env_credentials = (
            current_config and 
            current_config.llm.api_key and 
            current_config.embeddings.api_key
        )
        
        # Check if the request only contains settings changes (no new credentials)
        is_settings_only = (
            has_env_credentials and
            not request.azureApiKey and  # No new credentials provided
            not request.openaiApiKey and
            not request.geminiApiKey and
            not request.embeddingApiKey
        )
        
        # Only validate API keys if this is not a settings-only update
        if not is_settings_only:
            # Validate required fields based on provider
            if request.llmProvider == "openai":
                if not request.openaiApiKey:
                    raise HTTPException(status_code=400, detail="OpenAI API key is required")
            elif request.llmProvider == "azure":
                if not request.azureApiKey or not request.azureEndpoint or not request.azureDeploymentName:
                    raise HTTPException(status_code=400, detail="Azure API key, endpoint, and deployment name are required")
            elif request.llmProvider == "gemini":
                if not request.geminiApiKey:
                    raise HTTPException(status_code=400, detail="Gemini API key is required")
            
            # Validate embeddings
            if request.embeddingProvider == "openai":
                if not request.embeddingApiKey:
                    raise HTTPException(status_code=400, detail="Embeddings API key is required")
            elif request.embeddingProvider == "azure":
                if not request.embeddingApiKey or not request.embeddingEndpoint:
                    raise HTTPException(status_code=400, detail="Azure embeddings API key and endpoint are required")
        
        # Save configuration
        success = config_manager.save_ui_config(config_data)
        
        if not success:
            raise HTTPException(status_code=500, detail="Failed to save configuration")
        
        # Get updated config for response
        updated_config = config_manager.get_config_for_frontend()
        
        return ConfigResponse(
            success=True,
            message="Configuration saved successfully",
            config=updated_config
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save configuration: {str(e)}"
        )

@router.post("/reload", response_model=ConfigResponse)
async def reload_configuration():
    """Reload configuration from all sources."""
    try:
        config_manager.reload_config()
        config_data = config_manager.get_config_for_frontend()
        
        return ConfigResponse(
            success=True,
            message="Configuration reloaded successfully",
            config=config_data
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to reload configuration: {str(e)}"
        )

@router.get("/status", response_model=ConfigResponse)
async def get_configuration_status():
    """Get configuration status (whether system is properly configured)."""
    try:
        is_configured = config_manager.is_configured()
        current_config = config_manager.get_current_config()
        
        return ConfigResponse(
            success=True,
            message=f"System is {'properly configured' if is_configured else 'not configured'}",
            config={
                "isConfigured": is_configured,
                "source": current_config.source if current_config else "none",
                "hasLLM": bool(current_config and current_config.llm.api_key) if current_config else False,
                "hasEmbeddings": bool(current_config and current_config.embeddings.api_key) if current_config else False,
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get configuration status: {str(e)}"
        )