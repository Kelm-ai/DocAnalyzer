#!/usr/bin/env python3
"""
Token-based rate limiter using sliding window algorithm.
Designed for Anthropic's Claude API with configurable rate limits.

Rate limits vary by tier AND model. Configure via environment variables:
- ANTHROPIC_INPUT_TOKENS_PER_MINUTE: Input token limit (default: 450000 for Tier 2)
- ANTHROPIC_REQUESTS_PER_MINUTE: Request limit (default: 1000 for Tier 2)
- RATE_LIMIT_SAFETY_MARGIN: Use this fraction of the limit (default: 0.85)

Anthropic Rate Limits by Tier (Claude Opus/Sonnet 4.x):
  Tier 1: 50 RPM,    30,000 ITPM,   8,000 OTPM
  Tier 2: 1,000 RPM, 450,000 ITPM, 90,000 OTPM  (default)
  Tier 3: 2,000 RPM, 900,000 ITPM, 180,000 OTPM
  Tier 4: 4,000 RPM, 2,000,000 ITPM, 400,000 OTPM

See: https://docs.anthropic.com/en/docs/build-with-claude/rate-limits
"""

import asyncio
import logging
import os
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# Anthropic Tier 1 rate limits (default - adjust via env vars for your tier)
# These are the same across all models within a tier
# Tier 1: 1K RPM, 450K input tokens/min, 90K output tokens/min
# Lower tiers may have limits like 30K tokens/min
DEFAULT_INPUT_TOKENS_PER_MINUTE = int(os.getenv("ANTHROPIC_INPUT_TOKENS_PER_MINUTE", "450000"))
DEFAULT_REQUESTS_PER_MINUTE = int(os.getenv("ANTHROPIC_REQUESTS_PER_MINUTE", "1000"))
DEFAULT_OUTPUT_TOKENS_PER_MINUTE = int(os.getenv("ANTHROPIC_OUTPUT_TOKENS_PER_MINUTE", "90000"))


def get_model_rate_limit(model: Optional[str] = None) -> int:
    """
    Get the input token rate limit.

    Note: Anthropic rate limits are per-tier, not per-model.
    Configure via ANTHROPIC_INPUT_TOKENS_PER_MINUTE env var.
    """
    return DEFAULT_INPUT_TOKENS_PER_MINUTE


@dataclass
class TokenUsageRecord:
    """Record of token usage at a specific timestamp."""
    timestamp: float
    tokens: int


@dataclass
class RateLimiterConfig:
    """Configuration for the rate limiter."""
    max_tokens_per_minute: int = field(default_factory=lambda: DEFAULT_INPUT_TOKENS_PER_MINUTE)
    window_seconds: float = 60.0
    safety_margin: float = 0.85  # Use only 85% of limit for safety
    min_delay_between_requests: float = 0.1  # 100ms minimum between requests
    max_estimated_tokens_per_request: int = 8000  # Conservative estimate


class TokenRateLimiter:
    """
    Sliding window token rate limiter for API calls.

    Thread-safe using asyncio.Lock for concurrent access.
    """

    def __init__(self, config: Optional[RateLimiterConfig] = None, model: Optional[str] = None):
        self.config = config or RateLimiterConfig()
        self._usage_window: Deque[TokenUsageRecord] = deque()
        self._lock = asyncio.Lock()
        self._last_request_time: float = 0.0
        self.model = model

        # Use configured limit (from env var or default)
        # Note: Anthropic limits are per-tier, not per-model

        # Calculate effective limit with safety margin
        self._effective_limit = int(
            self.config.max_tokens_per_minute * self.config.safety_margin
        )

        logger.info(
            "TokenRateLimiter initialized: model=%s, %d tokens/min (effective: %d with %.0f%% margin)",
            self.model or "default",
            self.config.max_tokens_per_minute,
            self._effective_limit,
            self.config.safety_margin * 100
        )

    def _prune_old_records(self, current_time: float) -> None:
        """Remove records outside the sliding window."""
        cutoff = current_time - self.config.window_seconds
        while self._usage_window and self._usage_window[0].timestamp < cutoff:
            self._usage_window.popleft()

    def _current_usage(self, current_time: float) -> int:
        """Get total tokens used in the current window."""
        self._prune_old_records(current_time)
        return sum(record.tokens for record in self._usage_window)

    async def acquire(self, estimated_tokens: Optional[int] = None) -> Tuple[float, int]:
        """
        Acquire permission to make an API request.

        Args:
            estimated_tokens: Estimated tokens for this request.
                            Uses default if not provided.

        Returns:
            Tuple of (wait_time_seconds, current_usage_tokens)

        Blocks until rate limit allows the request.
        """
        tokens = estimated_tokens or self.config.max_estimated_tokens_per_request
        total_wait_time = 0.0

        async with self._lock:
            while True:
                current_time = time.monotonic()
                current_usage = self._current_usage(current_time)

                # Check minimum delay between requests
                time_since_last = current_time - self._last_request_time
                if time_since_last < self.config.min_delay_between_requests:
                    delay = self.config.min_delay_between_requests - time_since_last
                    await asyncio.sleep(delay)
                    total_wait_time += delay
                    current_time = time.monotonic()
                    current_usage = self._current_usage(current_time)

                # Check if we have capacity
                if current_usage + tokens <= self._effective_limit:
                    # Record the estimated usage immediately
                    self._usage_window.append(TokenUsageRecord(
                        timestamp=current_time,
                        tokens=tokens
                    ))
                    self._last_request_time = current_time

                    logger.debug(
                        "Rate limit acquired: %d tokens, current usage: %d/%d",
                        tokens, current_usage + tokens, self._effective_limit
                    )
                    return (total_wait_time, current_usage + tokens)

                # Calculate wait time based on oldest record
                if self._usage_window:
                    oldest = self._usage_window[0]
                    wait_time = (
                        oldest.timestamp +
                        self.config.window_seconds -
                        current_time +
                        0.1  # Small buffer
                    )
                else:
                    wait_time = 0.1

                wait_time = max(wait_time, 0.1)

                logger.info(
                    "Rate limit reached (%d/%d tokens), waiting %.2fs",
                    current_usage, self._effective_limit, wait_time
                )

                # Release lock while waiting
                self._lock.release()
                try:
                    await asyncio.sleep(wait_time)
                    total_wait_time += wait_time
                finally:
                    await self._lock.acquire()

    async def record_actual_usage(self, estimated_tokens: int, actual_tokens: int) -> None:
        """
        Update the record with actual token usage after API response.

        Args:
            estimated_tokens: The tokens we estimated when acquiring
            actual_tokens: The actual tokens used from API response
        """
        async with self._lock:
            current_time = time.monotonic()
            self._prune_old_records(current_time)

            # Find and update the most recent record with matching estimate
            for i in range(len(self._usage_window) - 1, -1, -1):
                if self._usage_window[i].tokens == estimated_tokens:
                    self._usage_window[i] = TokenUsageRecord(
                        timestamp=self._usage_window[i].timestamp,
                        tokens=actual_tokens
                    )
                    logger.debug(
                        "Updated token record: estimated=%d, actual=%d",
                        estimated_tokens, actual_tokens
                    )
                    return

            # If no matching record found, add the actual usage
            self._usage_window.append(TokenUsageRecord(
                timestamp=current_time,
                tokens=actual_tokens
            ))

    async def get_status(self) -> dict:
        """Get current rate limiter status for monitoring."""
        async with self._lock:
            current_time = time.monotonic()
            current_usage = self._current_usage(current_time)

            return {
                "model": self.model,
                "current_tokens": current_usage,
                "limit_tokens": self._effective_limit,
                "max_tokens": self.config.max_tokens_per_minute,
                "utilization_percent": round(
                    (current_usage / self._effective_limit) * 100, 1
                ) if self._effective_limit > 0 else 0,
                "window_seconds": self.config.window_seconds,
                "records_in_window": len(self._usage_window),
            }

    async def handle_429_error(self, retry_after_seconds: Optional[float] = None) -> float:
        """
        Handle a 429 rate limit error from the API.

        Args:
            retry_after_seconds: Retry-After header value if provided

        Returns:
            Recommended wait time in seconds
        """
        async with self._lock:
            # If API provides retry-after, use it
            if retry_after_seconds and retry_after_seconds > 0:
                logger.warning(
                    "429 received, API suggests waiting %.1fs",
                    retry_after_seconds
                )
                return retry_after_seconds

            # Otherwise, estimate based on our window
            current_time = time.monotonic()
            if self._usage_window:
                oldest = self._usage_window[0]
                wait_time = (
                    oldest.timestamp +
                    self.config.window_seconds -
                    current_time +
                    5.0  # Extra buffer after 429
                )
                wait_time = max(wait_time, 5.0)  # At least 5 seconds
            else:
                wait_time = 10.0  # Default 10 seconds

            logger.warning(
                "429 received, calculated wait time: %.1fs",
                wait_time
            )
            return wait_time


# Global rate limiter (single instance - Anthropic limits are per-tier, not per-model)
_rate_limiter: Optional[TokenRateLimiter] = None


def get_rate_limiter(model: Optional[str] = None, config: Optional[RateLimiterConfig] = None) -> TokenRateLimiter:
    """
    Get or create the global rate limiter.

    Args:
        model: Optional model name (stored for logging/monitoring only).
        config: Optional configuration override.

    Returns:
        Global TokenRateLimiter instance.
    """
    global _rate_limiter

    if _rate_limiter is None:
        if config is None:
            config = RateLimiterConfig(
                safety_margin=float(os.getenv("RATE_LIMIT_SAFETY_MARGIN", "0.85")),
            )
        _rate_limiter = TokenRateLimiter(config, model=model)

    return _rate_limiter


def reset_rate_limiter() -> None:
    """Reset the global rate limiter (for testing)."""
    global _rate_limiter
    _rate_limiter = None
