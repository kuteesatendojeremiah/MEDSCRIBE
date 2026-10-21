# Stage G privacy audit (engineering upgrade)

Scope: the repository at the Stage G commit, synthetic data, mock providers. "Verified" means a command or test was run and its
result observed on this development host. Nothing here is a compliance claim (see `docs/governance/open_decisions.md`).

## Verified by code search and tests

| Area | Finding | Evidence |
|---|---|---|
| Database / ORM / cache / object store | None in `backend/app` or the Dockerfile dependencies | `grep` of `*.py` for sqlite, sqlalchemy, psycopg, redis, mongo, boto, shelve, pickle found nothing in source |
| Browser storage | No `localStorage`, `sessionStorage`, IndexedDB, service worker or `document.cookie` in `frontend/src` | `frontend/src/storage_ban.test.ts` (runs in `npm test`), `e2e/privacy.spec.ts` |
| Server cookies | None set | no `set_cookie` in `backend/app` |
| Files on the server | Only `accounts.json` (usernames, display names, password hashes; no clinical content), written atomically via a temp file in its own directory | `security/accounts.py`; audio, notes and exports have no file path (`test_audio_is_not_written_to_disk`, `test_no_server_copy_nothing_left_in_temp_or_cwd`, `test_pdf_needs_no_temp_files_and_no_external_program`) |
| Logging | Two content-free `warning` lines ("approved-hash mismatch", "open HIGH item"); access log off in the image; a log filter drops content fields | `routes/render.py`, `logging_filter.py`, `test_marker_logging.py`, `test_provider_timeout.py::test_failure_paths_leave_no_marker_in_logs` |
| Telemetry / analytics / error reporting | None in application source or `frontend/package.json` | search for sentry, analytics, gtag, datadog, opentelemetry, posthog, mixpanel found hits only inside third-party packages in `.venv` |
| Error messages | Codes and classes only; validation errors never echo input; settings errors never echo values | `test_hardening.py`, `test_settings.py` |
| Retrieval of old sessions | No route returns stored clinical content; cleared, revoked and expired tokens are refused on every clinical endpoint | `tests/test_session_lifecycle.py` (16 tests) |
| Server memory | Request-scoped. The only process-level state is the token revocation list (token ids and expiry times), login throttle counters and rate-limit timestamps | `security/tokens.py`, `limits.py` |

## Server session design (resolves the spec's "temporary-session service")
No server-side session store exists, by design (CLAUDE.md rules 1-3). A "session" is a signed token (identity only, 15 minute
inactivity limit, 2 hour absolute limit) plus the browser's in-memory state. Clearing revokes the token (id only) and drops browser
memory. Expiry needs no cleanup job because the server holds nothing to clean.

## Cannot be verified from the codebase (open risks)
- **Render**: proxy and platform logging, request buffering, swap, core dumps, snapshots and backups are not controllable on the free
  tier (`render.yaml`, `docs/deploy.md`). Synthetic data only.
- **Speech and language-model providers**: none enabled (`PROVIDER=mock`, gate closed), so their retention terms are undocumented
  here. Each needs the written checklist in `docs/governance/provider_gate_checklist.md` before enabling.
- **Browser**: tab memory can be swapped to disk by the operating system; downloaded files are outside Mediscribe's control.
- **Docker image**: never built on this host; `HEALTHCHECK` untested.
- **Timed-out provider threads** keep their audio buffer until they return (ADR-0008).
- **Multiple instances**: with an empty `TOKEN_SECRET` each process signs with its own random key, and revocations are per process.
  Render sets `TOKEN_SECRET`; revocation sharing across instances is not implemented (single instance assumed).
