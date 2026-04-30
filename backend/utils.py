"""
Utility functions: retry logic, validation, logging.
"""

import re
import time
import logging
import asyncio
from typing import TypeVar, Callable, Any, Optional

# Configure structured logging
logger = logging.getLogger("stock-analyzer")
handler = logging.StreamHandler()
formatter = logging.Formatter(
    "[%(asctime)s] %(levelname)s - %(name)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
handler.setFormatter(formatter)
logger.addHandler(handler)
logger.setLevel(logging.INFO)


# ─────────────────────────────────────────────────────────────────────────────
#  Validation
# ─────────────────────────────────────────────────────────────────────────────

def validate_ticker(ticker: str) -> str:
    """
    Validate and normalize ticker symbol.
    Returns uppercase ticker or raises ValueError.
    
    Accepts: A, AA, ABC, ABC.A (for Berkshire B), BRK-B, etc.
    Rejects: empty, >6 chars, invalid chars
    """
    if not ticker or not isinstance(ticker, str):
        raise ValueError("Ticker must be a non-empty string")
    
    ticker = ticker.strip().upper()
    
    # Allow alphanumeric, hyphens, dots (for nyse classes like BRK.B)
    if not re.match(r'^[A-Z0-9.\-]{1,6}$', ticker):
        raise ValueError(f"Invalid ticker format: {ticker}")
    
    return ticker


def validate_index(index: str, valid_options: list[str]) -> str:
    """Validate index name against allowed options."""
    if index not in valid_options:
        raise ValueError(f"Invalid index. Must be one of: {', '.join(valid_options)}")
    return index


# ─────────────────────────────────────────────────────────────────────────────
#  Retry Logic with Exponential Backoff
# ─────────────────────────────────────────────────────────────────────────────

T = TypeVar('T')


def retry_with_backoff(
    func: Callable[..., T],
    *args,
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 16.0,
    backoff_factor: float = 2.0,
    **kwargs
) -> T:
    """
    Retry a synchronous function with exponential backoff.
    
    Args:
        func: Function to retry
        max_retries: Maximum number of attempts
        base_delay: Initial delay in seconds
        max_delay: Maximum delay between retries
        backoff_factor: Multiplier for delay after each retry
        *args, **kwargs: Arguments to pass to func
    
    Returns:
        Result of func if successful
    
    Raises:
        Last exception if all retries fail
    """
    last_exception = None
    delay = base_delay
    
    for attempt in range(1, max_retries + 1):
        try:
            logger.debug(f"Attempt {attempt}/{max_retries}: {func.__name__}")
            return func(*args, **kwargs)
        except Exception as e:
            last_exception = e
            if attempt < max_retries:
                logger.warning(
                    f"Attempt {attempt} failed: {type(e).__name__}: {str(e)[:80]}. "
                    f"Retrying in {delay:.1f}s..."
                )
                time.sleep(delay)
                delay = min(delay * backoff_factor, max_delay)
            else:
                logger.error(
                    f"All {max_retries} attempts failed for {func.__name__}: {type(e).__name__}"
                )
    
    raise last_exception


async def retry_with_backoff_async(
    func: Callable[..., Any],
    *args,
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 16.0,
    backoff_factor: float = 2.0,
    **kwargs
) -> T:
    """
    Retry an async function with exponential backoff.
    
    Args:
        func: Async function to retry
        max_retries: Maximum number of attempts
        base_delay: Initial delay in seconds
        max_delay: Maximum delay between retries
        backoff_factor: Multiplier for delay after each retry
        *args, **kwargs: Arguments to pass to func
    
    Returns:
        Result of func if successful
    
    Raises:
        Last exception if all retries fail
    """
    last_exception = None
    delay = base_delay
    
    for attempt in range(1, max_retries + 1):
        try:
            logger.debug(f"Attempt {attempt}/{max_retries}: {func.__name__}")
            return await func(*args, **kwargs)
        except Exception as e:
            last_exception = e
            if attempt < max_retries:
                logger.warning(
                    f"Attempt {attempt} failed: {type(e).__name__}: {str(e)[:80]}. "
                    f"Retrying in {delay:.1f}s..."
                )
                await asyncio.sleep(delay)
                delay = min(delay * backoff_factor, max_delay)
            else:
                logger.error(
                    f"All {max_retries} attempts failed for {func.__name__}: {type(e).__name__}"
                )
    
    raise last_exception


# ─────────────────────────────────────────────────────────────────────────────
#  Error Messages
# ─────────────────────────────────────────────────────────────────────────────

TICKER_NOT_FOUND = "Ticker not found or has no financial data"
DATA_FETCH_ERROR = "Failed to fetch stock data after multiple attempts"
INVALID_PARAMETERS = "Invalid parameters provided"
CALCULATION_ERROR = "Error during calculation"
