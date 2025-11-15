"""
Centralized error handling for agent exceptions, particularly content filter violations.
"""
import logging

logger = logging.getLogger(__name__)

def is_content_filter_error(error: Exception) -> bool:
    """Check if the error is related to Azure OpenAI content filtering."""
    error_msg = str(error)
    return any(keyword in error_msg for keyword in [
        "content_filter",
        "ResponsibleAIPolicyViolation",
        "content management policy"
    ])


def is_jailbreak_attempt(error: Exception) -> bool:
    """Check if the error is specifically a jailbreak attempt."""
    error_msg = str(error)
    return "jailbreak" in error_msg.lower() and is_content_filter_error(error)


def get_user_friendly_error_message(error: Exception) -> str:
    """
    Convert technical errors into user-friendly messages.
    
    Args:
        error: The exception that occurred
        
    Returns:
        A user-friendly error message
    """
    error_msg = str(error)
    
    # Handle jailbreak attempts
    if is_jailbreak_attempt(error):
        return (
            "I cannot process this request as it appears to contain instructions "
            "that violate content safety policies. Please rephrase your question "
            "in a constructive manner, and I'll be happy to help."
        )
    
    # Handle other content filter violations
    if is_content_filter_error(error):
        # Check specific filter types
        if "hate" in error_msg and "filtered': True" in error_msg:
            return (
                "I cannot process this request as it contains content that may violate "
                "hate speech policies. Please rephrase your question respectfully."
            )
        if "violence" in error_msg and "filtered': True" in error_msg:
            return (
                "I cannot process this request as it contains content related to violence. "
                "Please ask your question in a different way."
            )
        if "self_harm" in error_msg and "filtered': True" in error_msg:
            return (
                "I'm concerned about the content of this request. If you're experiencing "
                "distress, please reach out to a mental health professional or crisis hotline."
            )
        if "sexual" in error_msg and "filtered': True" in error_msg:
            return (
                "I cannot process this request as it contains inappropriate content. "
                "Please keep questions professional and appropriate."
            )
        
        # Generic content filter message
        return (
            "I cannot process this request as it violates content safety policies. "
            "Please rephrase your question appropriately."
        )
    
    # Generic error fallback
    return "I apologize, but I encountered an error while processing your request."


def log_content_filter_violation(error: Exception, context: str = "") -> None:
    """
    Log content filter violations for security monitoring.
    
    Args:
        error: The exception that occurred
        context: Additional context (e.g., agent name, user ID)
    """
    if is_content_filter_error(error):
        error_type = "JAILBREAK" if is_jailbreak_attempt(error) else "CONTENT_FILTER"
        context_msg = f" in {context}" if context else ""
        logger.warning("SECURITY_ALERT: %s violation detected%s", error_type, context_msg)
        logger.warning("SECURITY_ALERT: Error details: %s", str(error)[:200])
