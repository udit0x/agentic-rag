"""
Encryption utilities for secure configuration storage.
"""
import os
import base64
import logging
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from typing import Optional

logger = logging.getLogger(__name__)

class ConfigEncryption:
    """Handles encryption/decryption of sensitive configuration data."""
    
    def __init__(self):
        self._fernet: Optional[Fernet] = None
        self._initialize_encryption()
    
    def _initialize_encryption(self):
        """Initialize encryption with a master key."""
        # Get master key from environment or generate one
        master_key = os.getenv('CONFIG_MASTER_KEY')
        environment = os.getenv('ENVIRONMENT', 'production')
        
        if not master_key:
            # Check if we're in production
            if environment == 'production':
                raise ValueError(
                    "CONFIG_MASTER_KEY must be set in production environment. "
                    "Never use default encryption keys in production!"
                )
            
            # For development, use a derived key from a password
            password = os.getenv('CONFIG_PASSWORD', 'default-dev-password-change-in-production')
            salt = os.getenv('CONFIG_SALT', 'default-salt-change-in-production').encode()
            
            if password == 'default-dev-password-change-in-production':
                logger.warning(
                    "Using default encryption password in development. "
                    "Set CONFIG_MASTER_KEY or CONFIG_PASSWORD for production!"
                )
            
            # Derive key from password
            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,
                salt=salt,
                iterations=100000,
            )
            key = base64.urlsafe_b64encode(kdf.derive(password.encode()))
        else:
            # Use provided master key
            key = master_key.encode()
        
        self._fernet = Fernet(key)
    
    def encrypt(self, plaintext: str) -> str:
        """Encrypt sensitive data."""
        if not plaintext:
            return ""
        
        try:
            encrypted_bytes = self._fernet.encrypt(plaintext.encode())
            return base64.urlsafe_b64encode(encrypted_bytes).decode()
        except Exception as e:
            logger.error("Encryption failed: %s", str(e))
            return plaintext  # Fallback to plaintext (not ideal)
    
    def decrypt(self, encrypted_text: str) -> str:
        """Decrypt sensitive data."""
        if not encrypted_text:
            return ""
        
        try:
            encrypted_bytes = base64.urlsafe_b64decode(encrypted_text.encode())
            decrypted_bytes = self._fernet.decrypt(encrypted_bytes)
            return decrypted_bytes.decode()
        except Exception as e:
            logger.error("Decryption failed: %s", str(e))
            return encrypted_text  # Fallback to encrypted text (assuming it's already plain)
    
    def is_encrypted(self, text: str) -> bool:
        """Check if text appears to be encrypted."""
        if not text:
            return False
        
        try:
            # Try to decode as base64 - encrypted data should be base64 encoded
            base64.urlsafe_b64decode(text.encode())
            # If it decodes successfully and doesn't look like a typical API key format
            return not (text.startswith(('sk-', 'pk-', 'https://')) or len(text) < 32)
        except:
            return False

# Global encryption instance
config_encryption = ConfigEncryption()

# Define which fields should be encrypted
SENSITIVE_FIELDS = {
    'api_key',
    'azureApiKey', 
    'openaiApiKey',
    'geminiApiKey',
    'embeddingApiKey',
    'password',
    'secret',
    'token'
}

def encrypt_sensitive_config(config_data: dict) -> dict:
    """Encrypt sensitive fields in configuration data."""
    encrypted_config = config_data.copy()
    
    def encrypt_nested(obj, path=""):
        if isinstance(obj, dict):
            for key, value in obj.items():
                current_path = f"{path}.{key}" if path else key
                
                if isinstance(value, str) and (key.lower() in SENSITIVE_FIELDS or 'key' in key.lower()):
                    if value and not config_encryption.is_encrypted(value):
                        obj[key] = config_encryption.encrypt(value)
                        logger.debug("Encrypted field: %s", current_path)
                elif isinstance(value, (dict, list)):
                    encrypt_nested(value, current_path)
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                encrypt_nested(item, f"{path}[{i}]")
    
    encrypt_nested(encrypted_config)
    return encrypted_config

def decrypt_sensitive_config(config_data: dict) -> dict:
    """Decrypt sensitive fields in configuration data."""
    decrypted_config = config_data.copy()
    
    def decrypt_nested(obj, path=""):
        if isinstance(obj, dict):
            for key, value in obj.items():
                current_path = f"{path}.{key}" if path else key
                
                if isinstance(value, str) and (key.lower() in SENSITIVE_FIELDS or 'key' in key.lower()):
                    if value and config_encryption.is_encrypted(value):
                        obj[key] = config_encryption.decrypt(value)
                        logger.debug("Decrypted field: %s", current_path)
                elif isinstance(value, (dict, list)):
                    decrypt_nested(value, current_path)
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                decrypt_nested(item, f"{path}[{i}]")
    
    decrypt_nested(decrypted_config)
    return decrypted_config