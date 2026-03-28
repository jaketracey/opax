"""
parli.cache -- Redis caching layer for OPAX FastAPI endpoints.

Provides a @cached decorator for FastAPI route handlers and utilities
for cache invalidation after pipeline runs.

Usage:
    from parli.cache import cached, invalidate_all, invalidate_pattern

    @app.get("/api/stats")
    @cached(ttl=3600)
    def stats():
        ...

    # After a pipeline run:
    invalidate_all()

    # Targeted invalidation:
    invalidate_pattern("opax:/api/search:*")

Redis connection is configured via the REDIS_URL environment variable
(default: redis://localhost:6379). If Redis is unavailable, the decorator
falls back gracefully -- endpoints work normally without caching.
"""

import functools
import hashlib
import json
import logging
import os
import time
from typing import Any, Callable, Optional

import redis

logger = logging.getLogger("opax.cache")

# ---------------------------------------------------------------------------
# Redis connection
# ---------------------------------------------------------------------------

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")

_pool: Optional[redis.ConnectionPool] = None
_available: Optional[bool] = None  # tri-state: None = untested


def _get_pool() -> redis.ConnectionPool:
    """Lazily create and return a shared connection pool."""
    global _pool
    if _pool is None:
        _pool = redis.ConnectionPool.from_url(
            REDIS_URL,
            decode_responses=True,
            max_connections=20,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
    return _pool


def get_redis() -> Optional[redis.Redis]:
    """
    Return a Redis client, or None if Redis is unavailable.

    Caches the availability check so we don't retry on every request
    when Redis is down. Rechecks every 60 seconds.
    """
    global _available
    try:
        client = redis.Redis(connection_pool=_get_pool())
        if _available is None:
            client.ping()
            _available = True
            logger.info("Redis connected at %s", REDIS_URL)
        return client
    except (redis.ConnectionError, redis.TimeoutError, OSError) as e:
        if _available is not False:
            logger.warning("Redis unavailable (%s) -- caching disabled", e)
            _available = False
        return None


def _reset_availability():
    """Allow re-checking Redis availability (called periodically)."""
    global _available
    _available = None


# Recheck Redis availability every 60 seconds
_last_recheck = 0.0
_RECHECK_INTERVAL = 60.0


def _maybe_recheck():
    global _last_recheck
    now = time.monotonic()
    if now - _last_recheck > _RECHECK_INTERVAL:
        _last_recheck = now
        _reset_availability()


# ---------------------------------------------------------------------------
# TTL presets by endpoint pattern
# ---------------------------------------------------------------------------

# Default TTLs (seconds) for known endpoint patterns.
# The @cached decorator's explicit ttl argument takes priority.
TTL_PRESETS: dict[str, int] = {
    "/api/stats": 3600,                # 1 hour
    "/api/mps": 3600,                  # 1 hour
    "/api/topics": 3600,               # 1 hour
    "/api/search": 600,                # 10 minutes
    "/api/disconnect/rankings": 3600,  # 1 hour
    "/api/donor-influence": 3600,      # 1 hour
    "/api/your-mp/": 21600,            # 6 hours
    "/api/timeline/": 3600,            # 1 hour
    "/api/grants/stats": 21600,        # 6 hours
}

DEFAULT_TTL = 3600  # 1 hour fallback


def _resolve_ttl(endpoint: str, explicit_ttl: Optional[int]) -> int:
    """Determine TTL for an endpoint, checking explicit > presets > default."""
    if explicit_ttl is not None:
        return explicit_ttl
    # Check presets (prefix match for parameterized routes)
    for pattern, ttl in TTL_PRESETS.items():
        if endpoint.startswith(pattern):
            return ttl
    return DEFAULT_TTL


# ---------------------------------------------------------------------------
# Cache key generation
# ---------------------------------------------------------------------------

def _make_key(endpoint: str, params: dict[str, Any]) -> str:
    """
    Build a deterministic cache key.

    Format: opax:{endpoint}:{hash_of_params}
    Params are sorted and hashed to keep keys short and consistent.
    """
    # Sort params for deterministic ordering; drop None values
    filtered = {k: v for k, v in sorted(params.items()) if v is not None}
    if filtered:
        param_str = json.dumps(filtered, sort_keys=True, default=str)
        param_hash = hashlib.sha256(param_str.encode()).hexdigest()[:16]
    else:
        param_hash = "none"
    return f"opax:{endpoint}:{param_hash}"


# ---------------------------------------------------------------------------
# @cached decorator
# ---------------------------------------------------------------------------

def cached(ttl: Optional[int] = None, prefix: Optional[str] = None):
    """
    Decorator that caches FastAPI endpoint responses in Redis.

    Args:
        ttl: Cache TTL in seconds. If None, uses TTL_PRESETS or DEFAULT_TTL.
        prefix: Override the endpoint path used in the cache key.
                Useful when the route path is parameterized.

    The decorator inspects the function's keyword arguments to build
    the cache key. For FastAPI, these correspond to path params and
    query params.

    If Redis is unavailable, the decorated function runs normally
    with zero overhead beyond a failed connection check.

    Example:
        @app.get("/api/stats")
        @cached(ttl=3600)
        def stats():
            ...

        @app.get("/api/your-mp/{postcode}")
        @cached(ttl=21600)
        def your_mp(postcode: str):
            ...
    """
    def decorator(func: Callable) -> Callable:
        endpoint = prefix or func.__name__

        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            _maybe_recheck()
            r = get_redis()

            # Build cache key from function arguments
            # For FastAPI endpoints, kwargs contain path + query params
            cache_params = dict(kwargs)
            # Also capture positional args by name if possible
            if args:
                import inspect
                sig = inspect.signature(func)
                param_names = list(sig.parameters.keys())
                for i, arg in enumerate(args):
                    if i < len(param_names):
                        cache_params[param_names[i]] = arg

            key = _make_key(endpoint, cache_params)
            effective_ttl = _resolve_ttl(endpoint, ttl)

            # Try cache read
            if r is not None:
                try:
                    hit = r.get(key)
                    if hit is not None:
                        logger.debug("Cache HIT: %s", key)
                        return json.loads(hit)
                except (redis.RedisError, json.JSONDecodeError) as e:
                    logger.debug("Cache read error: %s", e)

            # Cache miss -- call the actual function
            result = func(*args, **kwargs)

            # Try cache write
            if r is not None and result is not None:
                try:
                    serialized = json.dumps(result, default=str)
                    r.setex(key, effective_ttl, serialized)
                    logger.debug("Cache SET: %s (ttl=%ds)", key, effective_ttl)
                except (redis.RedisError, TypeError) as e:
                    logger.debug("Cache write error: %s", e)

            return result

        # Expose cache metadata for testing/introspection
        wrapper._cache_endpoint = endpoint
        wrapper._cache_ttl = ttl
        return wrapper

    return decorator


# ---------------------------------------------------------------------------
# Async variant
# ---------------------------------------------------------------------------

def cached_async(ttl: Optional[int] = None, prefix: Optional[str] = None):
    """
    Async version of @cached for async FastAPI endpoints.

    Usage:
        @app.get("/api/search")
        @cached_async(ttl=600)
        async def search(q: str, ...):
            ...
    """
    def decorator(func: Callable) -> Callable:
        endpoint = prefix or func.__name__

        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            _maybe_recheck()
            r = get_redis()

            cache_params = dict(kwargs)
            if args:
                import inspect
                sig = inspect.signature(func)
                param_names = list(sig.parameters.keys())
                for i, arg in enumerate(args):
                    if i < len(param_names):
                        cache_params[param_names[i]] = arg

            key = _make_key(endpoint, cache_params)
            effective_ttl = _resolve_ttl(endpoint, ttl)

            if r is not None:
                try:
                    hit = r.get(key)
                    if hit is not None:
                        logger.debug("Cache HIT: %s", key)
                        return json.loads(hit)
                except (redis.RedisError, json.JSONDecodeError) as e:
                    logger.debug("Cache read error: %s", e)

            result = await func(*args, **kwargs)

            if r is not None and result is not None:
                try:
                    serialized = json.dumps(result, default=str)
                    r.setex(key, effective_ttl, serialized)
                    logger.debug("Cache SET: %s (ttl=%ds)", key, effective_ttl)
                except (redis.RedisError, TypeError) as e:
                    logger.debug("Cache write error: %s", e)

            return result

        wrapper._cache_endpoint = endpoint
        wrapper._cache_ttl = ttl
        return wrapper

    return decorator


# ---------------------------------------------------------------------------
# Invalidation
# ---------------------------------------------------------------------------

def invalidate_all() -> int:
    """
    Flush all OPAX cache entries. Call after a pipeline run.

    Returns the number of keys deleted, or 0 if Redis is unavailable.
    """
    r = get_redis()
    if r is None:
        return 0

    try:
        keys = list(r.scan_iter(match="opax:*", count=500))
        if keys:
            deleted = r.delete(*keys)
            logger.info("Cache invalidated: %d keys deleted", deleted)
            return deleted
        return 0
    except redis.RedisError as e:
        logger.warning("Cache invalidation failed: %s", e)
        return 0


def invalidate_pattern(pattern: str) -> int:
    """
    Delete cache entries matching a glob pattern.

    Args:
        pattern: Redis key pattern, e.g. "opax:search:*" or "opax:stats:*"

    Returns the number of keys deleted.
    """
    r = get_redis()
    if r is None:
        return 0

    try:
        keys = list(r.scan_iter(match=pattern, count=500))
        if keys:
            deleted = r.delete(*keys)
            logger.info("Cache invalidated %d keys matching '%s'", deleted, pattern)
            return deleted
        return 0
    except redis.RedisError as e:
        logger.warning("Cache pattern invalidation failed: %s", e)
        return 0


def invalidate_endpoint(endpoint: str) -> int:
    """
    Delete all cached responses for a specific endpoint.

    Args:
        endpoint: The endpoint name/path, e.g. "stats" or "/api/stats"
    """
    return invalidate_pattern(f"opax:{endpoint}:*")


# ---------------------------------------------------------------------------
# Cache info / diagnostics
# ---------------------------------------------------------------------------

def cache_info() -> dict[str, Any]:
    """
    Return cache diagnostics: connection status, key count, memory usage.
    Useful for health checks and admin endpoints.
    """
    r = get_redis()
    if r is None:
        return {"status": "unavailable", "keys": 0, "memory": "0B"}

    try:
        info = r.info("memory")
        keys = 0
        for key in r.scan_iter(match="opax:*", count=500):
            keys += 1
        return {
            "status": "connected",
            "url": REDIS_URL,
            "keys": keys,
            "memory_used": info.get("used_memory_human", "unknown"),
        }
    except redis.RedisError as e:
        return {"status": f"error: {e}", "keys": 0, "memory": "0B"}
