"""Hybrid middleware for API key management and quota enforcement.

Flow:
1. Check if user has personal API key → Use it (bypass quota)
2. Check if user is unlimited (owner) → Use backend key (no quota check)
3. Check if user has quota remaining → Use backend key (decrement quota)
4. Reject request (quota exhausted)
"""
import os
import base64
import logging
from typing import Dict, Optional, Tuple
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

logger = logging.getLogger(__name__)

# Encryption setup for personal keys
USER_KEY_MASTER = os.getenv("USER_KEY_MASTER", Fernet.generate_key().decode())

def derive_user_encryption_key(user_id: str) -> bytes:
    """Derive a unique encryption key for each user."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=user_id.encode() + b"_api_key_salt_v1",
        iterations=100000,
    )
    key_material = kdf.derive(USER_KEY_MASTER.encode())
    return base64.urlsafe_b64encode(key_material)

def encrypt_user_api_key(user_id: str, api_key: str) -> str:
    """Encrypt a user's personal API key."""
    encryption_key = derive_user_encryption_key(user_id)
    fernet = Fernet(encryption_key)
    encrypted = fernet.encrypt(api_key.encode())
    return encrypted.decode()

def decrypt_user_api_key(user_id: str, encrypted_api_key: str) -> str:
    """Decrypt a user's personal API key."""
    encryption_key = derive_user_encryption_key(user_id)
    fernet = Fernet(encryption_key)
    decrypted = fernet.decrypt(encrypted_api_key.encode())
    return decrypted.decode()

async def get_api_key_for_request(user_id: str, db) -> Dict:
    """
    Get the appropriate API key and apply quota logic.
    
    Returns:
        {
            "allowed": bool,
            "api_key": str,
            "provider": str,
            "source": "personal" | "backend",
            "quota_remaining": int | None,
            "key_index": int | None,  # For backend keys
            "error": str | None
        }
    """
    # Fetch user data
    user = await db.fetchone("""
        SELECT 
            is_unlimited,
            remaining_quota,
            encrypted_api_key,
            api_key_provider,
            azure_endpoint,
            azure_deployment_name,
            use_general_knowledge,
            document_relevance_threshold
        FROM users
        WHERE id = $1
    """, user_id)
    
    if not user:
        return {
            "allowed": False,
            "error": "User not found",
            "api_key": None,
            "provider": None,
            "source": None,
            "quota_remaining": None,
            "key_index": None
        }
    
    # PRIORITY 1: User has personal API key (bypasses quota)
    if user['encrypted_api_key']:
        try:
            personal_key = decrypt_user_api_key(user_id, user['encrypted_api_key'])
            provider = user['api_key_provider'] or 'openai'
            
            logger.info("User %s using personal %s key (quota bypassed)", user_id, provider)
            
            result = {
                "allowed": True,
                "api_key": personal_key,
                "provider": provider,
                "source": "personal",
                "quota_remaining": None,  # Not applicable
                "key_index": None,
                "error": None,
                "use_general_knowledge": user.get('use_general_knowledge', True),
                "document_relevance_threshold": float(user.get('document_relevance_threshold', 0.65))
            }
            
            # Add Azure-specific config if provider is azure
            if provider == 'azure':
                result['azure_endpoint'] = user['azure_endpoint']
                result['azure_deployment'] = user['azure_deployment_name']
                logger.debug("Personal Azure config - endpoint: %s, deployment: %s",
                           user['azure_endpoint'], user['azure_deployment_name'])
            
            return result
        except Exception as e:
            logger.error("Failed to decrypt personal key for user %s: %s", user_id, str(e))
            # Fall through to backend key
    
    # PRIORITY 2: Owner/unlimited user (uses backend key, no quota)
    if user['is_unlimited']:
        backend_key = os.getenv("AZURE_OPENAI_API_KEY")
        if not backend_key:
            return {
                "allowed": False,
                "error": "Backend API key not configured",
                "api_key": None,
                "provider": None,
                "source": None,
                "quota_remaining": None,
                "key_index": None
            }
        
        logger.info("Unlimited user %s using backend key", user_id)
        
        return {
            "allowed": True,
            "api_key": backend_key,
            "provider": "azure",  # Backend keys are Azure
            "source": "backend",
            "quota_remaining": None,  # Unlimited
            "key_index": None,
            "error": None
        }
    
    # PRIORITY 3: Regular user with quota (uses backend key, check quota)
    if user['remaining_quota'] <= 0:
        return {
            "allowed": False,
            "error": "Message limit reached. Add your personal API key to continue.",
            "api_key": None,
            "provider": None,
            "source": None,
            "quota_remaining": 0,
            "key_index": None
        }
    
    # Atomically decrement quota
    result = await db.fetchone("""
        UPDATE users
        SET remaining_quota = remaining_quota - 1
        WHERE id = $1 AND remaining_quota > 0
        RETURNING remaining_quota
    """, user_id)
    
    if not result:
        # Race condition: quota exhausted between check and update
        return {
            "allowed": False,
            "error": "Message limit reached. Add your personal API key to continue.",
            "api_key": None,
            "provider": None,
            "source": None,
            "quota_remaining": 0,
            "key_index": None
        }
    
    backend_key = os.getenv("AZURE_OPENAI_API_KEY")
    if not backend_key:
        # Rollback quota decrement
        await db.execute("""
            UPDATE users
            SET remaining_quota = remaining_quota + 1
            WHERE id = $1
        """, user_id)
        
        return {
            "allowed": False,
            "error": "Backend API key not configured",
            "api_key": None,
            "provider": None,
            "source": None,
            "quota_remaining": user['remaining_quota'],
            "key_index": None
        }
    
    new_quota = result['remaining_quota']
    
    logger.info("User %s using backend key (quota: %d remaining)", user_id, new_quota)
    
    return {
        "allowed": True,
        "api_key": backend_key,
        "provider": "azure",
        "source": "backend",
        "quota_remaining": new_quota,
        "key_index": None,
        "error": None
    }

async def save_user_personal_key(
    user_id: str, 
    api_key: str, 
    provider: str, 
    db,
    azure_endpoint: str = None,
    azure_deployment_name: str = None
) -> bool:
    """Save user's personal API key (encrypted) with optional Azure config."""
    try:
        encrypted_key = encrypt_user_api_key(user_id, api_key)
        
        await db.execute("""
            UPDATE users
            SET encrypted_api_key = $1,
                api_key_provider = $2,
                azure_endpoint = $3,
                azure_deployment_name = $4
            WHERE id = $5
        """, encrypted_key, provider, azure_endpoint, azure_deployment_name, user_id)
        
        logger.info("Saved personal %s key for user %s", provider, user_id)
        return True
    except Exception as e:
        logger.error("Failed to save personal key for user %s: %s", user_id, str(e))
        return False

async def remove_user_personal_key(user_id: str, db) -> bool:
    """Remove user's personal API key."""
    try:
        await db.execute("""
            UPDATE users
            SET encrypted_api_key = NULL,
                api_key_provider = NULL
            WHERE id = $1
        """, user_id)
        
        logger.info("Removed personal key for user %s", user_id)
        return True
    except Exception as e:
        logger.error("Failed to remove personal key for user %s: %s", user_id, str(e))
        return False

async def get_user_key_status(user_id: str, db) -> Dict:
    """Check if user has a personal key configured."""
    user = await db.fetchone("""
        SELECT 
            encrypted_api_key,
            api_key_provider,
            remaining_quota,
            is_unlimited,
            azure_endpoint,
            azure_deployment_name,
            use_general_knowledge,
            document_relevance_threshold
        FROM users
        WHERE id = $1
    """, user_id)
    
    if not user:
        return {
            "has_personal_key": False,
            "provider": None,
            "quota_remaining": 0,
            "is_unlimited": False,
            "azure_endpoint": None,
            "azure_deployment": None,
            "use_general_knowledge": True,
            "document_relevance_threshold": 0.65
        }
    
    return {
        "has_personal_key": bool(user['encrypted_api_key']),
        "provider": user['api_key_provider'],
        "quota_remaining": user['remaining_quota'],
        "is_unlimited": user['is_unlimited'],
        "azure_endpoint": user['azure_endpoint'],
        "azure_deployment": user['azure_deployment_name'],
        "use_general_knowledge": user.get('use_general_knowledge', True),
        "document_relevance_threshold": float(user.get('document_relevance_threshold', 0.65))
    }
