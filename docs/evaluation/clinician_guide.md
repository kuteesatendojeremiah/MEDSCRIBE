# Mediscribe – clinician guide (evaluation, fictional cases only)

**This is a prototype. Use it only with fictional cases. Never enter or say a real patient's details.**
Everything is a draft: you review, edit, preview and approve. Mediscribe keeps nothing.

## Before you start
- Use a browser profile without writing or spell-check extensions. Evaluation mode: open `…/?eval=1`
  (it records counts and times only – never any words you type or say).
- Know the limits: the app **does not save**. If you close or refresh the tab before you download, the
  draft is gone. Your sign-in expires after 15 minutes of inactivity (warning at 13; hard limit 2 hours).

## The five steps
1. **New session** – choose the template, language(s), who is present, a temporary reference, an
   optional patient label (you type it; it is printed on the note, never saved) and tick the consent
   statement. *Start is disabled until you tick it.*
2. **Record** – speak the fictional consultation (or upload a synthetic audio file). Say examination
   findings aloud if you can ("On examination…"). Press **Stop & process**.
3. **Review** – transcript (original beside English), draft note, review items.
   - Click a **role label** to correct who spoke. Edit transcript or note text where it is wrong.
   - Click a note item's **[time role]** tag to see where it came from.
   - **Type** findings that were not spoken (examination, vitals) with **+ Add finding**.
   - **Open every red HIGH item.** Enter the missing value, or **Mark unverified** if you cannot confirm it.
4. **Preview & approve** – read the document exactly as it will print. You approve *that version*
   (the short code, e.g. `a3f9-27c1`). Any change afterwards cancels the approval.
5. **Download & end** – the file has a neutral name. File it in the official record, then
   **End session & clear**.

## What the colours mean
| Item | Meaning | What you do |
|---|---|---|
| **HIGH** (red) | missing/unclear dose, route or frequency; allergy status unknown; conflicting facts; unknown speaker | open it, enter the value or mark unverified |
| **CHECK** (amber) | possible diagnosis, unclear translation, inaudible speech | review; confirm or leave (it is listed on the note) |
| **INFO** | something not recorded | no action |

Unverified items print in **red** on the note as `UNVERIFIED`.

## Things to remember
- A question is not a finding. "Heart failure is possible" is a **possibility**, not a diagnosis.
- A relative's words are marked "reported by relative", not as the patient's own.
- Mediscribe never guesses a dose, route or frequency. A gap is a prompt for you.
- If something fails you will see a short error code: *recoverable* errors keep your draft (retry or type the
  note yourself); *terminal* errors clear everything and you start again.

## After each case (2 minutes)
Tell the study lead: what was wrong in the draft, what was missing, anything confusing, and whether you
understood what is lost if the tab closes.
