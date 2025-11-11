"""Authentication middleware for FastAPI endpoints.

Extracts and validates user ID from Clerk JWT tokens passed from Express middleware.
Prevents userId spoofing by extracting from trusted authentication headers.
"""
from fastapi import Header, HTTPException
from typing import Optional

async def get_authenticated_user_id(
    x_user_id: Optional[str] = Header(None, alias="x-user-id")
) -> Optional[str]:
    """
    Extract authenticated user ID from request headers.
    
    This header is set by Clerk middleware in Express (index.ts) after validating
    the JWT token. It cannot be spoofed by clients because Express validates it.
    
    Args:
        x_user_id: User ID extracted from Clerk JWT by Express middleware
        
    Returns:
        Authenticated user ID or None if not authenticated
    """
    return x_user_id


async def require_authenticated_user(
    x_user_id: Optional[str] = Header(None, alias="x-user-id")
) -> str:
    """
    Require authentication and return user ID.
    
    Raises HTTPException if user is not authenticated.
    
    Args:
        x_user_id: User ID from Clerk authentication
        
    Returns:
        Authenticated user ID
        
    Raises:
        HTTPException: 401 if user is not authenticated
    """
    if not x_user_id:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Please sign in to access this resource."
        )
    return x_user_id
