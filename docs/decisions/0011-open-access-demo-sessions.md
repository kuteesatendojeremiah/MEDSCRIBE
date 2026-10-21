# ADR-0011: Guest sessions without a sign-in form (demo deployments only)

- Status: accepted by the product owner ("I don't see need for the sign in form"; chose auto-start)
- Blueprint refs: FR-01 (facility SSO), §6.2 (session limits), §10.4 (authentication, limits); CLAUDE.md rule 9; ADR-0003, ADR-0006

## Decision
`OPEN_ACCESS=true` (default `false`) enables `POST /auth/open`, which issues a guest token with no credentials. The app calls it by
itself, shows no sign-in form, and starts a new guest session again after expiry or Clear session. The clinician types the name
printed on the note on the New consultation form (required in this mode).

## Safeguards kept
- Refused at startup unless `SYNTHETIC_ONLY=true`: this mode can never be switched on for real patient data.
- The guest token is the same signed, short-lived (15 min inactivity, 2 h absolute) revocable token, sent in the Authorization header.
- Each guest has its own identity and rate-limit bucket; starting guest sessions is itself rate limited
  (`OPEN_SESSIONS_PER_MINUTE`, default 20) so new guests cannot be used to bypass limits.
- Guests have role `doctor`: no administrator routes. Sign out and the Doctors screen are hidden in this mode.
- Real accounts, `DEV_AUTH_ENABLED` and the first-run setup remain in the code and are used when `OPEN_ACCESS` is off.

## Consequences / limits
- Anyone with the URL can use the synthetic-data demo. There is no identity behind a note: the approver name is whatever the
  clinician types, so it is not evidence of who approved. FR-01 (real facility SSO) is still open for any real use.
- A global limit of 20 new guests a minute can lock out legitimate users during a burst; abuse beyond that is not defended against.
- Render's `render.yaml` turns this on for the free-tier demo. Do not copy it to a deployment with real data.
