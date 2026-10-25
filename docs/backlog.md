# Backlog (ideas and out-of-scope items; not built)

- FR-19 (P2): additional specialty templates, after the cardiology evaluation.
- Live per-chunk audio streaming to a provider (ADR-0004), once a provider passes the gate.
- Real OIDC/SAML sign-in replacing the dev stub (ADR-0003); shared deny-list or IdP introspection for revocation.
- A real structured-output model behind the extraction interface, with the §15.1 suite re-run against it.
- Real WER and speaker-accuracy targets for Luganda and mixed speech (set before any real provider is used).
- Visual (screenshot) comparison of the exported DOCX/PDF against the reference note.
- Run the Dockerfile build in a container; host-level checks of swap, core dumps and proxy logging.
- Fluent-speaker review of every Luganda line in the fixtures.
- A clinician-facing "what changed since the draft" view of edited items (originals are already kept in tab memory).
- Extract audio in the browser before upload so large videos shrink to a small mono file (ADR-0013).
- Real doctor accounts for the hosted pilot (FR-01) before any real patient data; guest sessions are test-only (ADR-0011).
- Luganda-capable speech model and speaker identification; the local Whisper model supports neither.
