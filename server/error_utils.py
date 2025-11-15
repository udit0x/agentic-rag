"""
Utility functions for secure error handling.

Prevents leaking internal implementation details in production.
"""
import os
import logging
from fastapi import HTTPException

logger = logging.getLogger(__name__)


def safe_error_response(
    status_code: int,
    user_message: str,
    exception: Exception,
    log_context: str = ""
) -> HTTPException:
    """
    Create a safe HTTP exception that logs details server-side
    but only shows generic messages to users in production.
    
    Args:
        status_code: HTTP status code
        user_message: Generic message safe to show users
        exception: The actual exception that occurred
        log_context: Additional context for server logs
        
    Returns:
        HTTPException with appropriate detail level
    """
    environment = os.getenv("ENVIRONMENT", "production")
    
    # Always log full details server-side
    log_msg = f"{log_context}: {str(exception)}" if log_context else str(exception)
    logger.error(log_msg, exc_info=True)
    
    # In development, include exception details for debugging
    if environment == "development":
        detail = f"{user_message}: {str(exception)}"
    else:
        # In production, only show generic message
        detail = user_message
    
    return HTTPException(status_code=status_code, detail=detail)
