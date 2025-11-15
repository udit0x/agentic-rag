"""Configuration API endpoints."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any, Optional
import sys
from pathlib import Path
import re
import asyncio
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from server.config_manager import config_manager
from server.auth_middleware import get_authenticated_user_id
from server.hybrid_middleware import get_user_key_status

def validate_url(url: str) -> bool:
    """Validate that a URL has proper http:// or https:// protocol."""
    if not url or not url.strip():
        return False
    url_pattern = re.compile(r'^https?://.+', re.IGNORECASE)
    return bool(url_pattern.match(url.strip()))

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

class ConfigTestRequest(BaseModel):
    """Request model for testing configuration."""
    llmProvider: str
    openaiApiKey: str = ""
    openaiModel: str = "gpt-4o"
    azureApiKey: str = ""
    azureEndpoint: str = ""
    azureDeploymentName: str = ""
    embeddingProvider: str
    embeddingApiKey: str = ""
    embeddingEndpoint: str = ""
    embeddingModel: str = "text-embedding-3-large"

class ConfigTestResponse(BaseModel):
    """Response model for configuration test."""
    success: bool
    message: str
    llmTest: Dict[str, Any] = {}
    embeddingTest: Dict[str, Any] = {}

@router.get("/current", response_model=ConfigResponse)
async def get_current_config(
    user_id: Optional[str] = Depends(get_authenticated_user_id)
):
    """
    Get the current configuration for display in UI.
    
    Priority:
    1. If user is authenticated and has a personal API key, return that config
    2. Otherwise, return the system admin configuration
    """
    try:
        # Check if authenticated user has a personal key
        if user_id:
            from server.database_postgresql import PostgreSQLConnection
            db = PostgreSQLConnection()
            await db.connect()
            
            try:
                key_status = await get_user_key_status(user_id, db)
                
                # User has personal key - return config based on that
                if key_status.get("has_personal_key"):
                    provider = key_status.get("provider", "openai")
                    
                    config_data = {
                        "llmProvider": provider,
                        "embeddingProvider": provider,
                        "source": "personal",
                        "isValid": True,
                        "useGeneralKnowledge": key_status.get("use_general_knowledge", True),
                        "documentRelevanceThreshold": key_status.get("document_relevance_threshold", 0.65),
                    }
                    
                    # Add masked API key indicator and provider-specific fields
                    if provider == "openai":
                        config_data["openaiApiKey"] = "***"
                        config_data["openaiModel"] = "gpt-4o"
                        config_data["embeddingApiKey"] = "***"
                        config_data["embeddingModel"] = "text-embedding-3-large"
                    elif provider == "azure":
                        config_data["azureApiKey"] = "***"
                        # Return actual endpoint and deployment (not sensitive)
                        config_data["azureEndpoint"] = key_status.get("azure_endpoint") or ""
                        config_data["azureDeploymentName"] = key_status.get("azure_deployment") or ""
                        config_data["embeddingApiKey"] = "***"
                        config_data["embeddingEndpoint"] = key_status.get("azure_endpoint") or ""
                        config_data["embeddingModel"] = "text-embedding-3-large"
                    elif provider == "gemini":
                        config_data["geminiApiKey"] = "***"
                        config_data["geminiModel"] = "gemini-1.5-pro"
                        config_data["embeddingApiKey"] = "***"
                        config_data["embeddingModel"] = "text-embedding-004"
                    
                    return ConfigResponse(
                        success=True,
                        message="Personal configuration retrieved successfully",
                        config=config_data
                    )
            finally:
                # DO NOT close the shared connection pool - it's used by all requests
                # The pool is managed at application level, not per-request
                pass
        
        # No personal key or not authenticated - return system admin config
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
                # Validate Azure endpoint URL
                if not validate_url(request.azureEndpoint):
                    raise HTTPException(status_code=400, detail="Azure endpoint must start with http:// or https://")
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
                # Validate Azure embeddings endpoint URL
                if not validate_url(request.embeddingEndpoint):
                    raise HTTPException(status_code=400, detail="Azure embeddings endpoint must start with http:// or https://")
        
        # Save configuration
        success = await config_manager.save_ui_config(config_data)
        
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
        await config_manager.reload_config()
        config_data = await config_manager.get_config_for_frontend()
        
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

@router.post("/test", response_model=ConfigTestResponse)
async def test_configuration(request: ConfigTestRequest):
    """Test configuration by making actual API calls to verify connectivity."""
    try:
        llm_test_result = {"success": False, "error": None}
        embedding_test_result = {"success": False, "error": None}
        
        # Test LLM configuration
        try:
            if request.llmProvider == "openai":
                from openai import AsyncOpenAI
                client = AsyncOpenAI(api_key=request.openaiApiKey, timeout=10.0)
                # Simple test: list models or make a minimal completion
                response = await asyncio.wait_for(
                    client.chat.completions.create(
                        model=request.openaiModel,
                        messages=[{"role": "user", "content": "test"}],
                        max_tokens=1
                    ),
                    timeout=10.0
                )
                llm_test_result["success"] = True
                
            elif request.llmProvider == "azure":
                from openai import AsyncAzureOpenAI
                # Validate endpoint format
                if not validate_url(request.azureEndpoint):
                    llm_test_result["error"] = "Invalid endpoint URL format"
                else:
                    client = AsyncAzureOpenAI(
                        api_key=request.azureApiKey,
                        api_version="2024-02-15-preview",
                        azure_endpoint=request.azureEndpoint,
                        timeout=10.0
                    )
                    # Test with minimal completion
                    response = await asyncio.wait_for(
                        client.chat.completions.create(
                            model=request.azureDeploymentName,
                            messages=[{"role": "user", "content": "test"}],
                            max_tokens=1
                        ),
                        timeout=10.0
                    )
                    llm_test_result["success"] = True
                    
        except asyncio.TimeoutError:
            llm_test_result["error"] = "Connection timeout - please check your endpoint URL"
        except Exception as e:
            error_msg = str(e).lower()
            if "getaddrinfo failed" in error_msg or "connection error" in error_msg:
                llm_test_result["error"] = "Cannot connect to endpoint - please verify the URL is correct"
            elif "unauthorized" in error_msg or "401" in error_msg:
                llm_test_result["error"] = "Invalid API key"
            elif "not found" in error_msg or "404" in error_msg:
                llm_test_result["error"] = "Deployment not found - check deployment name"
            elif "unsupported" in error_msg:
                llm_test_result["error"] = "Invalid endpoint URL format - must start with http:// or https://"
            else:
                llm_test_result["error"] = f"Configuration error: {str(e)[:100]}"
        
        # Test Embeddings configuration
        try:
            if request.embeddingProvider == "openai":
                from openai import AsyncOpenAI
                client = AsyncOpenAI(api_key=request.embeddingApiKey, timeout=10.0)
                response = await asyncio.wait_for(
                    client.embeddings.create(
                        model=request.embeddingModel,
                        input="test"
                    ),
                    timeout=10.0
                )
                embedding_test_result["success"] = True
                
            elif request.embeddingProvider == "azure":
                from openai import AsyncAzureOpenAI
                # Validate endpoint format
                if not validate_url(request.embeddingEndpoint):
                    embedding_test_result["error"] = "Invalid endpoint URL format"
                else:
                    client = AsyncAzureOpenAI(
                        api_key=request.embeddingApiKey,
                        api_version="2024-02-15-preview",
                        azure_endpoint=request.embeddingEndpoint,
                        timeout=10.0
                    )
                    response = await asyncio.wait_for(
                        client.embeddings.create(
                            model=request.embeddingModel,
                            input="test"
                        ),
                        timeout=10.0
                    )
                    embedding_test_result["success"] = True
                    
        except asyncio.TimeoutError:
            embedding_test_result["error"] = "Connection timeout - please check your endpoint URL"
        except Exception as e:
            error_msg = str(e).lower()
            if "getaddrinfo failed" in error_msg or "connection error" in error_msg:
                embedding_test_result["error"] = "Cannot connect to endpoint - please verify the URL is correct"
            elif "unauthorized" in error_msg or "401" in error_msg:
                embedding_test_result["error"] = "Invalid API key"
            elif "not found" in error_msg or "404" in error_msg:
                embedding_test_result["error"] = "Model/deployment not found"
            elif "unsupported" in error_msg:
                embedding_test_result["error"] = "Invalid endpoint URL format - must start with http:// or https://"
            else:
                embedding_test_result["error"] = f"Configuration error: {str(e)[:100]}"
        
        # Overall success if both tests passed
        overall_success = llm_test_result["success"] and embedding_test_result["success"]
        
        if overall_success:
            message = "Configuration test successful - all connections verified"
        else:
            failed_parts = []
            if not llm_test_result["success"]:
                failed_parts.append("LLM")
            if not embedding_test_result["success"]:
                failed_parts.append("Embeddings")
            message = f"Configuration test failed for: {', '.join(failed_parts)}"
        
        return ConfigTestResponse(
            success=overall_success,
            message=message,
            llmTest=llm_test_result,
            embeddingTest=embedding_test_result
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to test configuration: {str(e)}"
        )