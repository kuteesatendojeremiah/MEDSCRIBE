"""Per-user rate limit (§10.4). Counters hold timestamps keyed by user id, never content."""

import time
from collections import defaultdict, deque
from typing import Callable

from app.security.errors import ApiError


class RateLimiter:
    def __init__(self, per_minute: int, now: Callable[[], float] = time.monotonic):
        self._limit = per_minute
        self._now = now
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, user: str) -> None:
        now = self._now()
        q = self._hits[user]
        while q and now - q[0] >= 60:
            q.popleft()
        for stale in [u for u, hits in self._hits.items() if not hits and u != user]:
            del self._hits[stale]  # keep nothing about users who have gone quiet
        if len(q) >= self._limit:
            raise ApiError(429, "E_RATE_LIMITED", "recoverable")
        q.append(now)
