# ADR-0002: Phase 1 interpretation choices

- Status: proposed (reported at the Phase 1 gate for product-owner confirmation)
- Blueprint refs: §6.1, §6.2, §8, §12.1, FR-09, FR-10, FR-16, Figure 4

## Decisions
1. **Opened vs resolved.** FR-09 and §8 unlock *Preview* when every HIGH item has been *opened*;
   §12.1 step 1 requires each HIGH item to be resolved or marked unverified before *approval*.
   `canPreview` = all HIGH opened; `canApprove` = additionally none still `open`. Never looser than the blueprint.
2. **Heartbeat.** Per §6.2 the 60 s heartbeat counts as activity while the tab is visible, so a
   visible tab never idles out; the 13/15 min rules bite in hidden tabs and as the safety net.
   The 2 h absolute limit always applies and cannot be renewed.
3. **Terminal error is a visible phase.** Figure 4 shows Terminal error -> Ended. The reducer clears
   all content on entry to `terminal_error`, shows only a content-free code, and `ACK_TERMINAL` moves to `ended`.
4. **Version hash is a placeholder** (non-cryptographic FNV over canonical JSON) until Phase 4
   implements SHA-256 (§12, FR-10). It exists so edit -> new hash -> approval reset is testable now.
5. **Extra explicit events** beyond the figure, each tab-memory only: `ACKNOWLEDGE_ITEM` (CHECK/INFO only; HIGH
   cannot be acknowledged), `REOPEN_FOR_EDIT` (the "edit (resets approval)" exit of Approved, §6.1),
   `SET_FORMAT` (DOCX/PDF choice, §8).
6. **No file in Phase 1.** "Download again" only marks the draft exported; the neutral file name is real,
   the document is produced in Phase 5.
7. **Mock processor** returns the synthetic Kato case after a delay. Dev-only buttons that force a
   recoverable or terminal error exist only when `import.meta.env.DEV` is true (absent from production builds).
