"""
Quota middleware for API rate limiting with hybrid key storage.

Security Requirements:
- All quota operations must be atomic (no race conditions)
- Owner account (uditkashyap29@gmail.com) has unlimited usage
- Users with personal API keys don't consume quota
- Backend enforcement only - never trust client values
- Return quota information in responses for transparency

Key Storage Strategy:
1. System API keys: Encrypted with Fernet (config_manager.py)
2. User personal keys: Two options:
   a) SHA-256 hash (verification-only, user provides key each time)
   b) Encrypted storage (convenience, automatic usage)
"""

import logging
from fastapi import HTTPException, Header
from typing import Optional, Literal
import hashlib
import os
import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from server.database_interface import db_storage

logger = logging.getLogger(__name__)


class QuotaExhausted(HTTPException):
    """Custom exception for quota exhaustion with proper HTTP 402 status."""
    
    def __init__(self, remaining: int = 0):
        super().__init__(
            status_code=402,
            detail={
                "error": "Quota exhausted",
                "message": "You have reached your API usage limit. Please upgrade your plan or wait for quota reset.",
                "remaining": remaining,
                "upgradeUrl": "/pricing"  # Can be customized
            }
        )


async def check_quota(
    user_id: str,
    use_user_key: bool = False,
    user_api_key: Optional[str] = None
) -> dict:
    """
    Check and decrement user quota atomically.
    
    Args:
        user_id: Authenticated user ID (from JWT token)
        use_user_key: If True, user is using their own API key (quota bypass)
        user_api_key: User's personal API key for verification
    
    Returns:
        dict with quota information:
        {
            "allowed": bool,
            "remaining": int,
            "is_unlimited": bool,
            "used_personal_key": bool
        }
    
    Raises:
        QuotaExhausted: If user has no remaining quota
        HTTPException: For other errors
    
    Security Notes:
    - Uses atomic SQL UPDATE...RETURNING to prevent race conditions
    - Validates API key hash if use_user_key=True
    - Never trusts client-provided quota values
    - All quota logic executed server-side only
    """
    
    try:
        # 1. Get user data with quota information
        user = await db_storage.getUser(user_id)
        
        if not user:
            raise HTTPException(
                status_code=404,
                detail=f"User not found: {user_id}"
            )
        
        # 2. Check if user is unlimited (owner or admin)
        is_unlimited = user.get("isUnlimited") or user.get("is_unlimited", False)
        
        if is_unlimited:
            logger.info("User %s has unlimited quota", user_id)
            return {
                "allowed": True,
                "remaining": -1,  # -1 indicates unlimited
                "is_unlimited": True,
                "used_personal_key": False
            }
        
        # 3. Check if user is using their own API key
        if use_user_key and user_api_key:
            # Verify the API key hash matches
            api_key_hash = user.get("apiKeyHash") or user.get("api_key_hash")
            
            if api_key_hash:
                # Hash the provided key and compare
                provided_hash = hashlib.sha256(user_api_key.encode()).hexdigest()
                
                if provided_hash == api_key_hash:
                    logger.info("User %s using personal API key - quota bypassed", user_id)
                    return {
                        "allowed": True,
                        "remaining": user.get("remainingQuota") or user.get("remaining_quota", 50),
                        "is_unlimited": False,
                        "used_personal_key": True
                    }
                else:
                    logger.warning("User %s provided invalid API key hash", user_id)
        
        # 4. Perform atomic quota deduction
        # This uses a single SQL UPDATE statement with WHERE clause to prevent race conditions
        result = await db_storage.decrementQuota(user_id)
        
        if result is None:
            # No rows updated - quota already at 0
            logger.warning("User %s quota exhausted", user_id)
            raise QuotaExhausted(remaining=0)
        
        remaining = result.get("remainingQuota") or result.get("remaining_quota", 0)
        
        logger.info("User %s quota decremented - %d remaining", user_id, remaining)
        
        return {
            "allowed": True,
            "remaining": remaining,
            "is_unlimited": False,
            "used_personal_key": False
        }
    
    except QuotaExhausted:
        raise
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error checking quota for user %s: %s", user_id, str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Quota check failed: {str(e)}"
        )


async def get_quota_status(user_id: str) -> dict:
    """
    Get current quota status for a user without decrementing.
    
    Args:
        user_id: User ID to check
    
    Returns:
        dict with current quota information
    """
    
    try:
        user = await db_storage.getUser(user_id)
        
        if not user:
            raise HTTPException(
                status_code=404,
                detail=f"User not found: {user_id}"
            )
        
        is_unlimited = user.get("isUnlimited") or user.get("is_unlimited", False)
        remaining = user.get("remainingQuota") or user.get("remaining_quota", 50)
        
        return {
            "userId": user_id,
            "email": user.get("email"),
            "remaining": -1 if is_unlimited else remaining,
            "isUnlimited": is_unlimited,
            "hasPersonalKey": bool(user.get("apiKeyHash") or user.get("api_key_hash"))
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error getting quota status for user %s: %s", user_id, str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get quota status: {str(e)}"
        )


def hash_api_key(api_key: str) -> str:
    """
    Hash an API key for secure storage (verification-only).
    
    Args:
        api_key: The API key to hash
    
    Returns:
        SHA-256 hash of the API key
    """
    return hashlib.sha256(api_key.encode()).hexdigest()


def get_user_encryption_key(user_id: str) -> bytes:
    """
    Derive a user-specific encryption key for storing their personal API key.
    
    This provides per-user encryption so that:
    1. Each user's key is encrypted with a different derived key
    2. Even if master key leaks, attacker needs user_id to decrypt
    3. User can't decrypt other users' keys
    
    Args:
        user_id: User ID to derive key for
    
    Returns:
        32-byte Fernet-compatible encryption key
    
    Security:
        - Master key stored in environment (move to AWS Secrets Manager for production)
        - User ID acts as salt (unique per user)
        - PBKDF2 with 100,000 iterations (slow brute force)
    """
    # Get master key from environment
    master_key = os.getenv("USER_KEY_MASTER", "default-master-key-change-in-production")
    
    if master_key == "default-master-key-change-in-production":
        logger.warning("Using default USER_KEY_MASTER - set in production!")
    
    # Derive user-specific key using PBKDF2
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=user_id.encode(),  # User ID as salt
        iterations=100000,  # Slow down brute force
    )
    
    derived_key = kdf.derive(master_key.encode())
    return base64.urlsafe_b64encode(derived_key)


def encrypt_user_api_key(api_key: str, user_id: str) -> str:
    """
    Encrypt a user's personal API key for storage.
    
    Uses per-user encryption key so each user's data is isolated.
    
    Args:
        api_key: The API key to encrypt
        user_id: User ID (used to derive encryption key)
    
    Returns:
        Base64-encoded encrypted API key
    """
    if not api_key:
        return ""
    
    try:
        user_key = get_user_encryption_key(user_id)
        fernet = Fernet(user_key)
        
        encrypted_bytes = fernet.encrypt(api_key.encode())
        encrypted_str = base64.urlsafe_b64encode(encrypted_bytes).decode()
        
        logger.debug("Encrypted API key for user %s", user_id[:8])
        return encrypted_str
        
    except Exception as e:
        logger.error("Encryption error for user %s: %s", user_id, str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to encrypt API key"
        )


def decrypt_user_api_key(encrypted_key: str, user_id: str) -> str:
    """
    Decrypt a user's personal API key.
    
    Args:
        encrypted_key: Base64-encoded encrypted API key
        user_id: User ID (used to derive encryption key)
    
    Returns:
        Decrypted API key
    """
    if not encrypted_key:
        return ""
    
    try:
        user_key = get_user_encryption_key(user_id)
        fernet = Fernet(user_key)
        
        encrypted_bytes = base64.urlsafe_b64decode(encrypted_key.encode())
        decrypted_bytes = fernet.decrypt(encrypted_bytes)
        
        return decrypted_bytes.decode()
        
    except Exception as e:
        logger.error("Decryption error for user %s: %s", user_id, str(e))
        # Don't raise exception - fallback to quota-based access
        return ""
