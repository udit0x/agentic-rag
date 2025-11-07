"""Enhanced Configuration Manager with Database-First approach and Encryption.

Priority Order:
1. Database (config_versions table) - UI configurations with encrypted sensitive fields
2. Environment Variables - Fallback for open source users  
3. Defaults - Last resort

This approach is perfect for open source projects that also need production database config.
Security: Sensitive fields (API keys, passwords) are encrypted when stored in database.
"""
import os
import json
import asyncio
from typing import Dict, Any, Optional, Literal
from dataclasses import dataclass, asdict
from datetime import datetime

# Import encryption utilities
from server.config_encryption import encrypt_sensitive_config, decrypt_sensitive_config

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
class DocumentLimitsConfig:
    """Document processing limits to prevent system overload."""
    max_file_size_mb: float = 10.0  # Maximum file size in MB
    max_extracted_chars: int = 500000  # Maximum extracted text characters (500K)
    max_chunks: int = 1000  # Maximum number of chunks allowed
    warn_file_size_mb: float = 5.0  # Show warning above this size
    warn_extracted_chars: int = 250000  # Show warning above this character count

@dataclass
class AppConfig:
    """Complete application configuration."""
    llm: LLMConfig
    embeddings: EmbeddingsConfig
    document_limits: DocumentLimitsConfig
    useGeneralKnowledge: bool = True
    documentRelevanceThreshold: float = 0.65
    updated_at: Optional[datetime] = None
    source: Literal["database", "env", "defaults"] = "defaults"
    version: str = "1.0.0"
    environment: str = "production"

class DatabaseFirstConfigManager:
    """Configuration manager with database-first approach."""
    
    def __init__(self):
        self._current_config: Optional[AppConfig] = None
        self._db_connection = None
        self._initialized = False
    
    async def initialize(self):
        """Initialize the configuration manager."""
        if self._initialized:
            return
        
        try:
            # Try to get database connection
            from server.database_postgresql import PostgreSQLConnection
            self._db_connection = PostgreSQLConnection()
            await self._db_connection.connect()
            print("[Config] Database connection established for configuration")
        except Exception as e:
            print(f"[Config] Database connection failed: {e}")
            print("[Config] Will use environment variables only")
            self._db_connection = None
        
        # Load configuration with priority order
        await self._load_configuration()
        self._initialized = True
    
    async def _load_configuration(self):
        """Load configuration with priority: Database > Environment > Defaults."""
        config = None
        
        # 1. Try database first (highest priority)
        if self._db_connection:
            config = await self._load_from_database()
            if config:
                print("[Config] Using database configuration (UI settings)")
        
        # 2. Fallback to environment variables
        if not config:
            config = self._load_from_environment()
            if config:
                print("[Config] Using environment configuration (fallback)")
        
        # 3. Last resort: defaults
        if not config:
            config = self._load_defaults()
            print("[Config] Using default configuration (requires setup)")
        
        self._current_config = config
    
    async def _load_from_database(self) -> Optional[AppConfig]:
        """Load active configuration from database."""
        try:
            if not self._db_connection:
                return None
            
            # Get the active configuration for current environment
            environment = os.getenv("ENVIRONMENT", "production")
            
            config_row = await self._db_connection.fetchone("""
                SELECT version, environment, config_data, created_at, activated_at
                FROM config_versions 
                WHERE is_active = true AND environment = $1
                ORDER BY activated_at DESC
                LIMIT 1
            """, environment)
            
            if not config_row:
                print(f"[Config] No active database configuration found for environment: {environment}")
                return None
            
            # Parse config data (handle both string and dict)
            config_data = config_row['config_data']
            if isinstance(config_data, str):
                config_data = json.loads(config_data)
            
            # Decrypt sensitive fields
            config_data = decrypt_sensitive_config(config_data)
            
            # Build configuration objects
            llm_data = config_data.get("llm", {})
            llm_config = LLMConfig(
                provider=llm_data.get("provider", "azure"),
                api_key=llm_data.get("api_key", ""),
                model=llm_data.get("model", "gpt-4o"),
                endpoint=llm_data.get("endpoint"),
                deployment_name=llm_data.get("deployment_name"),
                temperature=llm_data.get("temperature", 0.7),
                max_tokens=llm_data.get("max_tokens", 2000)
            )
            
            embeddings_data = config_data.get("embeddings", {})
            embeddings_config = EmbeddingsConfig(
                provider=embeddings_data.get("provider", "azure"),
                api_key=embeddings_data.get("api_key", ""),
                model=embeddings_data.get("model", "text-embedding-3-large"),
                endpoint=embeddings_data.get("endpoint"),
                deployment_name=embeddings_data.get("deployment_name")
            )
            
            # Merge with environment credentials if database has empty credentials
            # This allows UI to store settings while env provides secrets
            # Merge with environment credentials
            embeddings_config = self._merge_with_env_credentials(embeddings_config, "embeddings")
            
            # Document limits configuration
            doc_limits_data = config_data.get("documentLimits", {})
            document_limits = DocumentLimitsConfig(
                max_file_size_mb=doc_limits_data.get("maxFileSizeMb", 10.0),
                max_extracted_chars=doc_limits_data.get("maxExtractedChars", 500000),
                max_chunks=doc_limits_data.get("maxChunks", 1000),
                warn_file_size_mb=doc_limits_data.get("warnFileSizeMb", 5.0),
                warn_extracted_chars=doc_limits_data.get("warnExtractedChars", 250000)
            )
            
            app_config = AppConfig(
                llm=llm_config,
                embeddings=embeddings_config,
                document_limits=document_limits,
                useGeneralKnowledge=config_data.get("useGeneralKnowledge", True),
                documentRelevanceThreshold=config_data.get("documentRelevanceThreshold", 0.65),
                updated_at=config_row['activated_at'] or config_row['created_at'],
                source="database",
                version=config_row['version'],
                environment=config_row['environment']
            )
            
            # Validate the configuration
            if self._is_valid_config(app_config):
                print(f"[Config] Loaded valid database config version {config_row['version']}")
                return app_config
            else:
                print("[Config] Database configuration is invalid (missing credentials)")
                return None
                
        except Exception as e:
            print(f"[Config] Error loading database configuration: {e}")
            return None
    
    def _merge_with_env_credentials(self, config, config_type: str):
        """Merge database config with environment credentials."""
        if config_type == "llm":
            # If database has empty credentials, use environment
            if not config.api_key:
                config.api_key = os.getenv("AZURE_OPENAI_API_KEY", "")
            if not config.endpoint and config.provider == "azure":
                config.endpoint = os.getenv("AZURE_OPENAI_ENDPOINT", "")
            if not config.deployment_name and config.provider == "azure":
                config.deployment_name = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "")
        
        elif config_type == "embeddings":
            if not config.api_key:
                config.api_key = os.getenv("AZURE_OPENAI_API_KEY", "")
            if not config.endpoint and config.provider == "azure":
                config.endpoint = os.getenv("AZURE_OPENAI_ENDPOINT", "")
            if not config.deployment_name and config.provider == "azure":
                config.deployment_name = os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME", "")
        
        return config
    
    def _load_from_environment(self) -> Optional[AppConfig]:
        """Load configuration from environment variables."""
        try:
            # Check if we have the basic required environment variables
            azure_key = os.getenv("AZURE_OPENAI_API_KEY")
            azure_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
            
            if not azure_key or not azure_endpoint:
                print("[Config] Missing required environment variables (AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT)")
                return None
            
            # LLM Configuration
            llm_config = LLMConfig(
                provider="azure",  # Default to Azure from environment
                api_key=azure_key,
                model=os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4o"),
                endpoint=azure_endpoint,
                deployment_name=os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4o"),
                temperature=float(os.getenv("LLM_TEMPERATURE", "0.7")),
                max_tokens=int(os.getenv("LLM_MAX_TOKENS", "2000"))
            )
            
            # Embeddings Configuration
            embeddings_config = EmbeddingsConfig(
                provider="azure",
                api_key=azure_key,  # Reuse same Azure key
                model=os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME", "text-embedding-3-large"),
                endpoint=azure_endpoint,
                deployment_name=os.getenv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME", "text-embedding-3-large")
            )
            
            # Document processing limits
            document_limits = DocumentLimitsConfig(
                max_file_size_mb=float(os.getenv("DOC_MAX_FILE_SIZE_MB", "10.0")),
                max_extracted_chars=int(os.getenv("DOC_MAX_EXTRACTED_CHARS", "500000")),
                max_chunks=int(os.getenv("DOC_MAX_CHUNKS", "1000")),
                warn_file_size_mb=float(os.getenv("DOC_WARN_FILE_SIZE_MB", "5.0")),
                warn_extracted_chars=int(os.getenv("DOC_WARN_EXTRACTED_CHARS", "250000"))
            )
            
            # Application settings
            use_general_knowledge = os.getenv("USE_GENERAL_KNOWLEDGE", "true").lower() == "true"
            doc_threshold = float(os.getenv("DOCUMENT_RELEVANCE_THRESHOLD", "0.65"))
            
            app_config = AppConfig(
                llm=llm_config,
                embeddings=embeddings_config,
                document_limits=document_limits,
                useGeneralKnowledge=use_general_knowledge,
                documentRelevanceThreshold=doc_threshold,
                source="env",
                environment=os.getenv("ENVIRONMENT", "production")
            )
            
            if self._is_valid_config(app_config):
                print("[Config] Loaded valid environment configuration")
                return app_config
            else:
                print("[Config] Environment configuration is incomplete")
                return None
                
        except Exception as e:
            print(f"[Config] Error loading environment configuration: {e}")
            return None
    
    def _load_defaults(self) -> AppConfig:
        """Load default configuration (requires user setup)."""
        return AppConfig(
            llm=LLMConfig(
                provider="azure",
                api_key="",
                model="gpt-4o",
                endpoint="",
                deployment_name="gpt-4o"
            ),
            embeddings=EmbeddingsConfig(
                provider="azure",
                api_key="",
                model="text-embedding-3-large",
                endpoint="",
                deployment_name="text-embedding-3-large"
            ),
            document_limits=DocumentLimitsConfig(),  # Use default limits
            useGeneralKnowledge=False,  # Conservative default
            documentRelevanceThreshold=0.65,
            source="defaults"
        )
    
    def _is_valid_config(self, config: AppConfig) -> bool:
        """Validate configuration completeness."""
        try:
            # Check LLM configuration
            if not config.llm.api_key:
                return False
            
            if config.llm.provider == "azure":
                if not config.llm.endpoint or not config.llm.deployment_name:
                    return False
            
            # Check embeddings configuration
            if not config.embeddings.api_key:
                return False
            
            if config.embeddings.provider == "azure":
                if not config.embeddings.endpoint or not config.embeddings.deployment_name:
                    return False
            
            return True
        except Exception:
            return False
    
    async def save_ui_config(self, config_data: Dict[str, Any]) -> bool:
        """Save configuration from UI to database."""
        if not self._db_connection:
            print("[Config] Cannot save UI config: No database connection")
            return False
        
        try:
            # Build configuration data
            llm_config_data = {
                "provider": config_data.get("llmProvider", "azure"),
                "api_key": config_data.get(f"{config_data.get('llmProvider', 'azure')}ApiKey", ""),
                "model": config_data.get(f"{config_data.get('llmProvider', 'azure')}Model", "gpt-4o"),
                "endpoint": config_data.get("azureEndpoint") if config_data.get("llmProvider") == "azure" else None,
                "deployment_name": config_data.get("azureDeploymentName") if config_data.get("llmProvider") == "azure" else None,
                "temperature": config_data.get("temperature", 0.7),
                "max_tokens": config_data.get("maxTokens", 2000)
            }
            
            embeddings_config_data = {
                "provider": config_data.get("embeddingProvider", "azure"),
                "api_key": config_data.get("embeddingApiKey", ""),
                "model": config_data.get("embeddingModel", "text-embedding-3-large"),
                "endpoint": config_data.get("embeddingEndpoint") if config_data.get("embeddingProvider") == "azure" else None,
                "deployment_name": config_data.get("embeddingModel") if config_data.get("embeddingProvider") == "azure" else None
            }
            
            new_config_data = {
                "llm": llm_config_data,
                "embeddings": embeddings_config_data,
                "useGeneralKnowledge": config_data.get("useGeneralKnowledge", True),
                "documentRelevanceThreshold": config_data.get("documentRelevanceThreshold", 0.65)
            }
            
            # Encrypt sensitive fields before storing
            encrypted_config_data = encrypt_sensitive_config(new_config_data)
            
            # Generate version and checksum (use original data for checksum consistency)
            import hashlib
            config_json = json.dumps(new_config_data, sort_keys=True)
            checksum = hashlib.sha256(config_json.encode()).hexdigest()[:16]
            
            # Get current version and increment
            current_version = await self._db_connection.fetchone("""
                SELECT version FROM config_versions 
                WHERE environment = $1 
                ORDER BY created_at DESC 
                LIMIT 1
            """, os.getenv("ENVIRONMENT", "production"))
            
            if current_version:
                # Simple version increment (1.0.0 -> 1.0.1)
                parts = current_version['version'].split('.')
                parts[-1] = str(int(parts[-1]) + 1)
                new_version = '.'.join(parts)
            else:
                new_version = "1.0.0"
            
            environment = os.getenv("ENVIRONMENT", "production")
            
            # Deactivate current active config
            await self._db_connection.execute("""
                UPDATE config_versions 
                SET is_active = false 
                WHERE environment = $1 AND is_active = true
            """, environment)
            
            # Insert new configuration (with encrypted data)
            await self._db_connection.execute("""
                INSERT INTO config_versions (
                    version, environment, config_data, is_active, 
                    checksum, created_by, deployed_by, activated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            """, 
            new_version,
            environment,
            json.dumps(encrypted_config_data),  # Store encrypted data
            True,  # Set as active
            checksum,
            "ui",
            "ui",
            datetime.now()
            )
            
            print(f"[Config] Saved new UI configuration version {new_version}")
            
            # Reload configuration
            await self._load_configuration()
            
            return True
            
        except Exception as e:
            print(f"[Config] Error saving UI configuration: {e}")
            return False
    
    def get_current_config(self) -> AppConfig:
        """Get the currently active configuration."""
        if not self._current_config:
            raise Exception("Configuration not initialized. Call initialize() first.")
        return self._current_config
    
    def get_config_for_frontend(self) -> Dict[str, Any]:
        """Get configuration formatted for frontend display."""
        if not self._current_config:
            return {"isValid": False, "source": "none"}
        
        config = self._current_config
        
        # Build response (don't expose full API keys for security)
        result = {
            "llmProvider": config.llm.provider,
            "embeddingProvider": config.embeddings.provider,
            "source": config.source,
            "version": config.version,
            "environment": config.environment,
            "isValid": self._is_valid_config(config),
            "useGeneralKnowledge": config.useGeneralKnowledge,
            "documentRelevanceThreshold": config.documentRelevanceThreshold,
            "updatedAt": config.updated_at.isoformat() if config.updated_at else None
        }
        
        # Add provider-specific fields (mask API keys for security)
        if config.llm.provider == "azure":
            result.update({
                "azureApiKey": "***" if config.llm.api_key else "",
                "azureEndpoint": config.llm.endpoint or "",
                "azureDeploymentName": config.llm.deployment_name or ""
            })
        elif config.llm.provider == "openai":
            result.update({
                "openaiApiKey": "***" if config.llm.api_key else "",
                "openaiModel": config.llm.model
            })
        elif config.llm.provider == "gemini":
            result.update({
                "geminiApiKey": "***" if config.llm.api_key else "",
                "geminiModel": config.llm.model
            })
        
        # Add embeddings info
        result.update({
            "embeddingApiKey": "***" if config.embeddings.api_key else "",
            "embeddingModel": config.embeddings.model
        })
        
        if config.embeddings.provider == "azure":
            result["embeddingEndpoint"] = config.embeddings.endpoint or ""
        
        return result
    
    def is_configured(self) -> bool:
        """Check if the system is properly configured."""
        return self._current_config and self._is_valid_config(self._current_config)
    
    async def reload_config(self):
        """Reload configuration from all sources."""
        await self._load_configuration()
    
    async def close(self):
        """Close database connection."""
        if self._db_connection:
            await self._db_connection.close()

# Global configuration manager instance
config_manager = DatabaseFirstConfigManager()