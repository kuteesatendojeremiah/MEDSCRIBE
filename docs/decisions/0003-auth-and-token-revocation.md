# ADR-0003: Sign-in stub, short-lived tokens and token revocation without a store

- Status: accepted for the synthetic-data prototype (Phase 2/5); revisit before any pilot
- Blueprint refs: §6.2, §10.4, FR-01, §3 step 11 ("token revoked"), CLAUDE.md rules 3 and 9

## Context
§10.4 requires facility SSO (identity only), a short-lived token in the Authorization header, and
§3/§6.1 require the token to be revoked when the session ends. Rule 3 forbids server state that holds
clinical content. A real IdP is not available in this project.

## Decision
1. **Dev login stub** (`POST /auth/dev-login`, enabled only while `DEV_AUTH_ENABLED=true`) returns a
   signed token for a typed name. It stands in for OIDC/SAML and is switched off in shared environments.
2. **Token** = base64url(JSON claims) + HMAC-SHA256 signature. Claims: `sub`, `jti`, `iat`, `exp`, `abs`.
   No clinical content. TTL 15 minutes (matches the inactivity timeout), `abs` = issue time + 2 hours.
3. **Renewal** (`POST /auth/refresh`) is driven by the browser heartbeat while the tab is visible and
   can never extend past `abs` (§6.2 "token cannot be renewed after that").
4. **Revocation** (`DELETE /auth/session`, called when the session ends): the token id (`jti`) goes into
   an in-memory deny-list with its expiry, purged on access. It holds **ids only**. A restart empties the
   deny-list, but with a random per-process secret all old tokens are invalid too; with a fixed secret a
   revoked token stays usable for at most its remaining TTL (<= 15 minutes). Accepted for the prototype;
   a shared deny-list or token introspection at the IdP is the production option.
5. **Transport**: Authorization header only; a token in a URL is never read (tested).
6. **Errors**: a missing/invalid/tampered/revoked token is a **terminal** error (§6.3); rate limit and
   upload size are **recoverable**.
7. **Rate limiter** counters are keyed by user id and hold timestamps only; idle users are pruned.

## Consequences
Tokens survive neither restarts (random secret) nor 15 minutes of silence. The stub must not be
deployed to real users. The client keeps the token in a module variable, never in browser storage.

---

# ADR-0004: Chunked upload after Stop instead of live streaming (Phase 2)

- Blueprint refs: §3 step 4, §5.1, §10.5 item 2

The browser records with MediaRecorder, keeps chunks in memory, and sends the finished recording in
one request after Stop. Request-scoped memory only; limit 50 MB; the audio buffer is dropped when
processing succeeds or the session ends. Live per-chunk streaming is deferred to the provider gate,
because the choice of provider (and whether it needs a different protocol) is exactly what the gate
decides. The server interface (`SpeechProvider.transcribe`) does not change when streaming is added.
