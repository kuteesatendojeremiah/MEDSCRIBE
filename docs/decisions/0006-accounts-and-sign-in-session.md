# ADR-0006: Doctor accounts, and the sign-in session is separate from the consultation session

- Status: accepted (product owner approved the plan, 19 Oct 2026)
- Blueprint refs: §3 steps 1 and 11, §6.1 (Idle = signed in), §6.2, §10.4, FR-01, CLAUDE.md rules 1 and 3; supersedes the dev stub part of ADR-0003

## Context
The prototype signed in automatically as a fixed doctor: no form, no accounts. Hospitals need named doctors
whose names print on approved notes. The blueprint says SSO "identity only" and, at End, "token revoked".
Revoking at every End would force a password entry after every patient.

## Decision
1. **Accounts** live in a small identity file (`backend/data/accounts.json`, git-ignored): username, display name,
   role (`admin` | `doctor`), salted PBKDF2-HMAC-SHA256 hash (240,000 iterations). It holds **no clinical content**;
   rule 1 concerns clinical data. Production should replace it with the facility's SSO (OIDC/SAML).
2. **First run:** with no accounts, the sign-in screen offers to create the first administrator (refused once any
   account exists). The administrator adds, resets and removes doctors in the app. The last administrator cannot be
   removed; nobody can remove themselves.
3. **Sign-in:** username + password; the same answer for unknown user and wrong password; after 5 failures in
   5 minutes that username is locked for the window; 15-minute token renewed by activity, 2-hour absolute cap.
4. **Demo sign-in** (`/auth/dev-login`) is **off by default** (`DEV_AUTH_ENABLED=false`); tests turn it on.
5. **Two sessions, not one.** *Consultation session:* End clears all clinical content from the tab (unchanged).
   *Sign-in session:* ends at **Sign out**, after 15 minutes without activity, when the token is rejected, or on tab close.
   This deviates from §3 step 11 ("End: token revoked"): End returns to the signed-in start screen (Idle, §6.1).
   Signing out during a consultation asks first and clears it.
6. The approver printed on exports is the signed-in doctor's display name, taken from the signed token, not from
   anything the browser sends.
7. Tokens and passwords are never kept in browser storage (checked in e2e); a page reload signs the user out.

## Consequences
Real, named accounts and an admin screen exist. A password file is now a thing to protect (file permissions,
no backups of it to unsafe places, rotate on suspicion). Password reset is by the administrator; there is no email
flow. Hospital SSO remains the production answer.
