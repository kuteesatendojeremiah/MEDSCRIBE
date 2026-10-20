# Incident response (draft; names and numbers are placeholders)

Scope: anything that could expose or lose clinical content handled by Mediscribe, or that breaks a
safety control (for example an export without an approved hash). Because Mediscribe stores nothing, the
usual harm is leakage in transit, in logs, on a host, or at a provider, or a note that was wrong and
was approved. **Fill in every `[ ]` before any pilot.**

## Roles

| Role | Name | Contact (24h) | Deputy |
|---|---|---|---|
| Incident lead (security lead) | [ ] | [ ] | [ ] |
| Clinical lead | [ ] | [ ] | [ ] |
| Data-protection officer (DPO) | [ ] | [ ] | [ ] |
| Technical lead | [ ] | [ ] | [ ] |
| Facility administration / legal | [ ] | [ ] | [ ] |
| Person who notifies the PDPO | [ ] | [ ] | [ ] |

## What counts as an incident

| Type | Examples | Severity |
|---|---|---|
| Content in logs, telemetry, crash reports, backups, swap or core dumps | the privacy scan or a log review finds a marker or real text | High |
| Unauthorised access | a token accepted that should not be; a host compromise | High |
| Provider-side retention or misrouting | a provider keeps or moves data against the gate form | High |
| Safety-control failure | an export rendered without a matching hash; a HIGH item bypassed; invented dose or route in a note | High (clinical) |
| Downloaded note left on a shared device or sent to the wrong person | | Medium |
| Availability | outage with no data exposure | Low |

Security events the application records (content-free): `approved-hash mismatch`, `export with an open
HIGH item`. Repeated occurrences are an incident, not noise.

## Steps

1. **Detect and report** – anyone suspecting an incident tells the incident lead immediately. Do not paste
   patient content into chat or tickets; use the error code, time and endpoint only.
2. **Contain** (within [ ] hours) – revoke tokens (restart with a new `TOKEN_SECRET`, which invalidates all
   tokens); set `PROVIDER_GATE_APPROVED=false`; take the affected host out of service; preserve evidence
   (logs and hashes, not clinical content).
3. **Assess** – what data, whose, how many people, how long, where it went. Use `data_flow_map.md` to list
   every place the data could have existed. Run `scripts/privacy_scan.sh` and `tests/privacy` against the host.
4. **Notify**
   - Facility management and DPO: immediately after containment.
   - **PDPO (Uganda Personal Data Protection Office)**: DPPA 2019 s.23 requires notification of breaches;
     the DPO confirms whether this incident qualifies and the legal deadline. Route: [ ] (portal / email /
     phone). Content: nature of the breach, categories and approximate number of people and records, likely
     consequences, measures taken, contact point. **Deadline: [ ] hours/days from awareness (DPO to confirm).**
   - Affected patients: as decided by the DPO and clinical lead.
   - Provider: per the breach-notice term agreed in the provider gate form.
5. **Clinical follow-up** – if a wrong note may have been filed (for example an invented dose), the clinical
   lead identifies the file(s), asks the clinician to correct the official record, and checks whether care
   was affected.
6. **Recover** – fix the cause; add a regression test (for a leak: a marker test; see
   `docs/prompts/recovery.md` "Suspected storage or logging leak"); write an ADR; re-run all tests and the
   privacy scan; record the date services resumed.
7. **Review** – within [ ] days: timeline, root cause, what worked, actions, owners, due dates. Update this
   document, the data-flow map and the risk table (§16).

## Log (copy per incident)

| Field | Entry |
|---|---|
| Incident id / date-time detected | |
| Reported by | |
| Type and severity | |
| Systems and data involved (no content) | |
| Containment actions and time | |
| PDPO notified (date/time, reference) | |
| Patients / facility / provider notified | |
| Root cause | |
| Fix, test and ADR references | |
| Closed by / date | |

*Draft for the security lead and DPO to complete and approve. Not legal advice.*
