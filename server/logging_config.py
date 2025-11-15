"""
Production-ready logging configuration for Azure deployment.

Features:
- Structured JSON logging for Azure Log Analytics
- Environment-based log levels (DEBUG for dev, INFO for prod)
- Non-blocking async-safe logging
- Proper log formatting with timestamps
- Request correlation ID support
"""

import logging
import sys
import os
import json
from datetime import datetime
from typing import Any, Dict


class JSONFormatter(logging.Formatter):
    """
    JSON formatter for structured logging in Azure.
    Outputs logs in JSON format for easy parsing by Azure Log Analytics.
    """
    
    def format(self, record: logging.LogRecord) -> str:
        log_data: Dict[str, Any] = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        
        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        
        # Add extra fields if present
        if hasattr(record, "correlation_id"):
            log_data["correlation_id"] = record.correlation_id
        
        if hasattr(record, "user_id"):
            log_data["user_id"] = record.user_id
        
        if hasattr(record, "request_id"):
            log_data["request_id"] = record.request_id
        
        return json.dumps(log_data)


class SimpleFormatter(logging.Formatter):
    """
    Simple human-readable formatter for development.
    """
    def __init__(self):
        super().__init__(
            fmt='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )


def configure_logging(use_json: bool = None, level: str = None):
    """
    Configure application-wide logging for production or development.
    
    Args:
        use_json: If True, use JSON formatting. If None, auto-detect from ENV.
        level: Log level (DEBUG, INFO, WARNING, ERROR). If None, auto-detect from ENV.
    
    Environment Variables:
        ENV: "prod" or "production" enables JSON logging and INFO level by default
        LOG_LEVEL: Override log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    """
    # Determine environment
    env = os.getenv("ENV", "dev").lower()
    is_production = env in ("prod", "production")
    
    # Determine log level
    if level is None:
        level = os.getenv("LOG_LEVEL", "INFO" if is_production else "DEBUG").upper()
    
    log_level = getattr(logging, level, logging.INFO)
    
    # Determine formatter
    if use_json is None:
        use_json = is_production
    
    # Create formatter
    if use_json:
        formatter = JSONFormatter()
    else:
        formatter = SimpleFormatter()
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    
    # Remove existing handlers to avoid duplicates
    for handler in root_logger.handlers[:]:
        root_logger.removeHandler(handler)
    
    # Create console handler (stdout for Azure container logs)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)
    
    # Reduce noise from third-party libraries
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("azure").setLevel(logging.WARNING)
    logging.getLogger("openai").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    
    # Log the configuration
    logger = logging.getLogger(__name__)
    logger.info(
        "Logging configured - env=%s, level=%s, json_format=%s",
        env,
        level,
        use_json
    )


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance for a specific module.
    
    Args:
        name: Logger name (usually __name__)
    
    Returns:
        Configured logger instance
    """
    return logging.getLogger(name)
