# ADR-0012: Implementing the Figma UI (frames 01 New consultation, 02 Review workspace, 03 Preview and approve)

- Status: accepted by the product owner (asked for an exact implementation of the Figma frames)
- Blueprint refs: §4.4 (review levels), §6.1 (states), §8 (screens), §12.1 (approval), FR-02, FR-09, FR-10; ADR-0009, ADR-0010

## Source and method
The Figma file could not be read directly (403, no connector). The three frames were supplied as PNG exports and stored in
`docs/design/` (1440 x 1000). Colours, sizes and spacing were measured from the pixels (tokens in `frontend/src/index.css`,
layout in `frontend/src/figma.css`); the typeface looks like Inter and is bundled locally (`@fontsource-variable/inter`), so the app
makes no external font request. Real screenshots of the running app are in `docs/design/actual/`.

## What follows the frames
Header (64px navy, pills), five-step bar (75px, 32px circles), New consultation (two columns, consultation and patient cards,
"Before recording" box, two side cards), Review (transcript | clinical note | needs attention, fixed-height scrolling columns,
footer in view), Preview (document card | final review).

## Deliberate differences, and why
1. **Real data, not the sample text.** Transcript rows, note sections, review items and the preview are rendered from the session.
   The note sections are the eight fixed schema sections (ADR-0010), so the frame's finer sub-headings (Presenting complaint,
   Associated symptoms) are shown as the section label plus a descriptive heading, not as separate stored sections.
2. **Honest disclosures kept.** One header pill says "Demo · mock transcription" when speech is mocked (the older banner is gone).
   A "Clear session" button stays in the header (ADR-0009) though the frame has none.
3. **Fields the frame lacks but the product needs.** File / OPD number, residence and People present stay (ADR-0007, header
   fields), and the consent checkbox stays inside the "Before recording" box because FR-02 requires an explicit tick.
4. **"Save review progress" is not implemented.** Nothing is saved by design; a button that pretended to would be false.
5. **Approve is separate from download.** "Approve note" approves only; the file is created on the Download screen where Word or
   PDF is chosen. Five final-review confirmations must be ticked by the clinician (none pre-ticked) in addition to the existing
   rules (every HIGH item opened and resolved or marked unverified).
6. **Consultation date is read-only** (set when the session starts); the clinician name is editable and printed on the note.
7. **Export glitches not copied.** The exports show Figma auto-layout glitches (oversized text in the side cards, overlapping
   buttons on Preview, a clipped label on Review); these were treated as export errors.
8. **Removed from the previous redesign** because the frames do not show them: the collapsible review dock, transcript
   collapse and width slider. Review items stay visible in the right column on desktop and stack below on narrow screens.
9. **Record and Download & end have no frame.** They reuse the same tokens, header, stepper, cards and buttons.

## Not verified
Pixel-level parity: only measured geometry (column positions and widths, header and stepper heights, key colours) is asserted in
`frontend/e2e/visual.spec.ts`; the rest was compared by eye against the frames.
