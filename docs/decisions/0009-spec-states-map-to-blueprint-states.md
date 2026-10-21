# ADR-0009: Upgrade-spec workspace states map onto the Blueprint §6.1 states

- Status: proposed (Stage C of the engineering upgrade)
- Blueprint refs: §6.1, §6.3, FR-14, FR-15; CLAUDE.md "the blueprint wins"

## Decision
The upgrade spec lists idle, requesting_permission, recording, paused, transcribing, generating, review, exporting, completed,
error and cleared. Blueprint §6.1 (Figure 4) defines Idle, Capture, Processing, Review, Preview, Approved, Ended plus the two
error classes (§6.3). Renaming the blueprint states would be a deviation, so none is made. The spec states are covered as:

| Spec state | Where it lives |
|---|---|
| requesting_permission | `Record` screen: "Starting microphone…" until `getUserMedia` resolves; denied and unavailable are told apart |
| recording / paused | phase `capture` with the `paused` flag (reducer `PAUSE`/`RESUME`, already present) |
| transcribing / generating | phase `processing`; `processingStage()` is `transcribing` until a transcript exists, then `generating` |
| review | `review` (and `preview`) |
| exporting | the in-flight render in `downloadApproved` (button disabled, duplicate clicks join the same render) |
| completed | `approved` with `exported = true` |
| error | `recoverable_error` / `terminal_error` |
| cleared | `ended` (Clear session button in the header, any active phase) |

Also: `runPipeline` and `downloadApproved` join an in-flight run, so a double click or React re-mount cannot send audio twice or
render two exports. No clinical content is held by these guards (only the promise).

## Not changed
No new phase names and no change to `note_schema.json`.
