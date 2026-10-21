# ADR-0008: Bounded provider calls, safe settings validation, readiness (Stage B)

- Status: proposed (Stage B of the engineering upgrade; awaiting product-owner approval at the phase gate)
- Blueprint refs: §6.3 (provider timeout, network drop and malformed output are recoverable; retry offered), §10.1 (content-free errors), §10.4 (limits), §12.2, FR-15

## Decision
1. **Provider calls are bounded.** Sync providers run in a worker thread under `PROVIDER_TIMEOUT_SECONDS` (default 60, 1-600).
   A timeout returns `504 E_PROVIDER_TIMEOUT`, class `recoverable` (§6.3). Previously there was no limit and a slow provider
   blocked the event loop.
2. **Automatic retry is off by default.** `PROVIDER_MAX_RETRIES` (default 0, max 2) applies only to errors a provider marks
   `retryable`. Never to timeouts, never to gate errors. Reason: a retry re-sends audio to a third party; §6.3 makes retry a
   clinician action ("offer retry"), so the default keeps it that way. Handlers are stateless, so a retry has no side effect.
3. **Settings are validated at startup**: known `PROVIDER` name, positive limits, `TOKEN_TTL_SECONDS <= TOKEN_ABSOLUTE_SECONDS`.
   Errors name the setting and never echo its value (`hide_input_in_errors`), so a mistyped secret cannot reach a log (§10.1).
4. **`GET /api/ready`** reports booleans only (frontend bundle present, provider usable); `GET /api/health` stays liveness.
   Dockerfile gains a `HEALTHCHECK` on `/api/health`.
5. **Browser calls time out** (30 s default, 60 s extract/render, 120 s transcribe, 90 s for the status/info wake-up calls) as
   recoverable `E_TIMEOUT`. Only the side-effect-free status and info GETs are retried (once); clinical POSTs never are.

## Known limits (not hidden)
- A timed-out worker thread cannot be killed; it finishes in the background and releases the audio when it returns.
- Not verified here: the Docker `HEALTHCHECK` (image not built), behaviour of a real provider (none enabled; rule 7).
