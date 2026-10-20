# Data-flow map (Blueprint §18.4 extended to every endpoint)

DRAFT for review by the facility data-protection officer and security lead. It describes what the
**code in this repository does today** (mock providers, synthetic data). It is not a statement of legal
compliance and must be re-done for any real provider (§10.5) and any real deployment.

Legend: **Tab** = the clinician's browser tab (JavaScript memory). **Req** = request-scoped server
memory, released when the response ends. **Disk** = anything written to disk.

## 1. Where each data element exists, for how long, and how it is cleared

| Data element | Created | Tab | Server (Req) | Disk | Provider | Cleared by |
|---|---|---|---|---|---|---|
| Sign-in identity (name) | dev login (SSO in production) | token claims in a JS variable | token signature check only | none | none | End session (token revoked server-side) or tab close; token expires in <= 15 min |
| Session token (signed, 15 min, 2 h cap) | `/auth/dev-login`, `/auth/refresh` | JS module variable (never storage, never URL) | deny-list of token ids after revoke | none | none | revoke; expiry; purge on access |
| Setup (template, languages, people present, temporary reference, patient label, consent) | New-session screen | React state | only inside `/extract` and `/render` requests | none | none | End / timeout / discard / terminal error / tab close |
| Audio | MediaRecorder or uploaded file | `Blob` in memory until processing succeeds | request body of `/transcribe` only; `bytearray` freed after the response | none (no temp file) | the speech provider **if one is ever enabled** (mock today) | dropped on success, End, timeout, error-terminal, tab close; kept only while a recoverable error allows retry |
| Transcript (original + English, roles, confidence) | `/transcribe` response; clinician edits | React state | request/response of `/transcribe`, then `/extract` | none | the speech/translation provider (mock today) | as setup |
| Draft note (items, sources, review items) | `/extract` response; clinician edits | React state (+ originals of edited items) | request/response of `/extract`; validated, never stored | none | the extraction model (mock rules today) | as setup |
| Approval (short + full SHA-256, time) | Approve button | React state | the hash is recomputed in `/render` (not stored) | none | none | any edit clears it; End clears it |
| Rendered preview (document model) | `/render?mode=preview` | React state | built and returned in one request | none | none | leaving Preview / End |
| Exported DOCX/PDF | `/render?mode=final` | transient `Blob`, URL revoked about 1 s after the click | built in memory and streamed; **PDF only**: a throw-away temp directory containing the DOCX and a LibreOffice profile, deleted in `finally` of the same request | PDF path only, seconds, tmpfs recommended | none | request end; the downloaded file is the doctor's responsibility (§10.6) |
| Download file name | client | neutral `consultation_note_YYYY-MM-DD_HHMM.ext` | same in `Content-Disposition` | n/a | n/a | n/a (contains no patient detail) |
| Evaluation metrics (dev/eval mode only) | counters in the tab | JS object, counts and section names only | never sent | none | none | page reload / next session |
| Logs | request lines and two security events | n/a | method, path, status, security-event names. No bodies, no headers with content (filter drops records with `text`, `transcript`, `audio`, `note`, `prompt`, `content`, `patient_label`) | host log files hold only that | n/a | host log policy |
| Error codes | on failures | shown to the clinician | `{"error": "E_...", "class": ...}` only | none | none | n/a |

## 2. Endpoint by endpoint

| Endpoint | Request carries | Server does | Response carries | Retained? |
|---|---|---|---|---|
| `GET /health` | nothing | returns `ok` | `{"status":"ok"}` | no |
| `POST /auth/dev-login` (dev only) | a typed name | issues a signed token | token | token id only after revoke |
| `POST /auth/refresh` | bearer token | issues a new token, never past the 2 h cap | token | no |
| `DELETE /auth/session` | bearer token | adds the token id to the deny-list | 204 | token id until expiry |
| `POST /transcribe` | audio bytes, expected languages | bounded read (50 MB) -> provider -> segments | transcript segments | no |
| `POST /extract` | transcript segments + header | validate -> provider -> safety/mapping layer -> review engine -> schema validation | note (items, review items) | no |
| `POST /render?mode=preview` | note | schema validation -> document model | document model | no |
| `POST /render?mode=final` | note + approved hash + approval time | schema validation -> hash check -> open-HIGH check -> DOCX (-> PDF) | file bytes, `no-store`, neutral name | no (PDF: temp dir for the request) |
| `GET /` (static) | nothing | serves the built frontend, `no-store` | HTML/JS/CSS | no |

Every response, including errors and static files, carries `Cache-Control: no-store`, `Pragma: no-cache`
and `X-Content-Type-Options: nosniff` (tested).

## 3. Third parties

Today none: the mock provider runs in-process and no data leaves the host. If a real speech, translation
or extraction provider is ever enabled, **each element in section 1 that reaches it** (audio, transcript,
header values) becomes personal data processed by that provider, and `provider_gate_checklist.md` must be
completed for that exact endpoint first (§10.5).

## 4. Known limits (§10.6)

Mediscribe can say what its own code and hosts do. It cannot prove the browser, operating system, network,
proxy or any provider keeps nothing unless verified. Downloaded files, browser downloads history and
clipboard contents are outside its control. The PDF path writes the document to a temp directory for the
duration of the request (deleted in `finally`; the deployment runs it on a tmpfs with swap and core dumps off).
