"""Timezone-aware datetime utilities for consistent timestamp handling."""
from datetime import datetime, timezone


def utc_now() -> datetime:
    """Return current UTC time as timezone-aware datetime.
    
    Returns timezone-aware datetime in UTC.
    For PostgreSQL, this works with both timestamp and timestamptz columns.
    """
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    """Return current UTC time as ISO 8601 string with 'Z' suffix."""
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def to_iso(dt: datetime) -> str:
    """Convert datetime to ISO 8601 string with 'Z' suffix for UTC."""
    if dt.tzinfo is None:
        # Naive datetime - treat as UTC and add 'Z' suffix
        return dt.isoformat() + 'Z'
    # Convert to UTC if has timezone
    utc_dt = dt.astimezone(timezone.utc)
    return utc_dt.isoformat().replace('+00:00', 'Z')
