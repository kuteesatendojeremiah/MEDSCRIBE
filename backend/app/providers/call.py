"""Bounded provider calls (§6.3: provider timeout and unavailability are recoverable; §12.2).

Providers are synchronous and hold no state, so they run in a worker thread under a timeout and the
event loop is never blocked. Retrying is safe because handlers are stateless; only errors a provider
marks retryable are retried, never gate errors and never timeouts. Errors carry content-free codes.

Known limit: a timed-out worker thread cannot be killed. It finishes in the background and drops its
references (audio included) when it returns, so memory is released late, not kept.
"""

import asyncio
from typing import Any, Callable

from app.providers.base import ProviderError, ProviderGateError
from app.security.errors import ApiError
from app.settings import Settings

RETRY_BACKOFF_SECONDS = 0.25


async def call_provider(
    fn: Callable[..., Any], *args: Any, settings: Settings, **kwargs: Any
) -> Any:
    attempts = settings.provider_max_retries + 1
    for attempt in range(attempts):
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(fn, *args, **kwargs), settings.provider_timeout_seconds
            )
        except asyncio.TimeoutError:
            raise ApiError(504, "E_PROVIDER_TIMEOUT", "recoverable") from None
        except ProviderGateError:
            raise
        except ProviderError as exc:
            if not exc.retryable or attempt == attempts - 1:
                raise
            await asyncio.sleep(RETRY_BACKOFF_SECONDS)
