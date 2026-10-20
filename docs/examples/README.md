# Worked example 2: hypertension follow-up (fictional)

A second, different consultation to try the whole flow with. **Fictional**: Mrs. A (62), follow-up for high
blood pressure and diabetes, two weeks of breathlessness on stairs and swollen ankles. Not the Kato example.

## Try it in 6 steps

1. Start the app (`powershell -ExecutionPolicy Bypass -File scripts\start_local.ps1 -Demo`) and sign in.
   The header badge should say **Local speech model**.
2. **New session**: tick consent, press **Start session**.
3. **Record** screen: press **Upload synthetic audio file instead** and choose
   `docs/examples/example_hypertension_followup.wav` (80 seconds, two voices: a man as the doctor, a woman as the patient).
   The first run loads the speech model, so allow a little time.
4. **Review**: every line starts as *Unknown*. The **Voices detected: 2** box groups the lines by sound.
   Choose **Voice 1 = Doctor**, **Voice 2 = Patient**, press **Apply roles & rebuild note**.
5. Read the draft note (below). Open the review items. There is no HIGH item, so **Preview** is open straight away.
6. **Preview → Approve this version & download** gives the DOCX. Then **End session & clear**.

No microphone? That is fine: the file upload is the whole test. To use your own voice, read the script below
(slowly, with a short pause between speakers) into the **Record** screen instead.

## The script (read this aloud to record your own version)

| # | Who | Says |
|---|---|---|
| 1 | Doctor | Good morning. What brings you in today? |
| 2 | Patient | I have been breathless when I climb stairs for two weeks. My ankles are also swollen. |
| 3 | Doctor | Do you have chest pain? |
| 4 | Patient | No. |
| 5 | Doctor | Do you wake up at night short of breath? |
| 6 | Patient | No. |
| 7 | Doctor | Any allergies to medicines? |
| 8 | Patient | I am allergic to penicillin. |
| 9 | Doctor | What medicines do you take? |
| 10 | Patient | I take amlodipine 5 milligrams once daily and metformin 500 milligrams twice daily. |
| 11 | Doctor | Blood pressure is 160 over 100. Pulse is 88 and regular. Weight is 74 kilograms. On examination there is bilateral pitting oedema. I can hear fine crackles at both lung bases. |
| 12 | Patient | Okay doctor. |
| 13 | Doctor | My impression is hypertension. Heart failure is possible. Start ramipril 5 milligrams orally once daily. Do an echocardiogram and renal function tests. Come back in four weeks. |

## What the draft note should look like

(Produced by the local speech model + the note builder from the audio above; exact wording of the transcript can
differ slightly with another voice or accent.)

**History**
- Shortness of breath for 2 weeks
- Shortness of breath worse on exertion (climbing stairs)
- No chest pain (patient denied)
- No night-time breathlessness (patient denied)

**Medications and allergies**
- Allergy: penicillin (patient-reported)
- Amlodipine 5 mg once daily
- Metformin 500 mg twice daily

**Vital signs**
- BP 160/100 mmHg
- Pulse 88/min, regular
- Weight 74 kg

**Examination**
- Pulse regular
- Bilateral pitting edema
- Fine crackles at both lung bases

**Investigations**
- *(nothing recorded)*

**Assessment**
- Hypertension – clinician-stated
- Possible heart failure – differential, NOT confirmed

**Treatment**
- Ramipril 5 mg orally once daily

**Plan**
- Echocardiogram
- Renal function tests
- Review in 4 weeks

**Review items**
- **CHECK** 'Heart failure is possible' – confirm as differential only
- **INFO** Respiratory rate, SpO2 and temperature not recorded
- **INFO** Investigations section empty

## What this example shows

- **Spoken numbers** become digits ("five hundred milligrams" = 500 mg; "one hundred and sixty over one hundred" = 160/100).
- **Each medicine keeps its own dose**: amlodipine 5 mg once daily, metformin 500 mg twice daily (they share one sentence).
- **A named allergy is an allergy**, not a medicine: penicillin appears under allergies only.
- **A question is not a fact**: "Do you have chest pain?" becomes a recorded fact only because the patient answered *No*.
- **"Heart failure is possible"** is kept as a possibility (CHECK), not a diagnosis.
- **Nothing is invented**: the doctor's start of ramipril gives dose, route and frequency, so nothing is flagged; if you
  mumble the dose, it becomes a red HIGH item instead of a guess.
- **Missing vitals** (respiratory rate, SpO2, temperature) are listed as not recorded.

## Try breaking it (useful tests)

- Read the dose of ramipril unclearly or skip it: a HIGH item appears; you must resolve it or mark it unverified.
- Say "I am not allergic to anything": the allergy line becomes a recorded fact; skip the question and *Allergy status unknown* turns red.
- Swap a role (Voice 1 = Patient): doctor-only content such as the examination and plan disappears, because the
  note builder will not accept an examination or plan from a patient. Fix the roles and rebuild.

## Files

- `docs/examples/example_hypertension_followup.wav`: the audio (two text-to-speech voices; synthetic).
- `fixtures/synthetic/example_hypertension_followup.json`: the real speech-model output for that audio, roles unknown.
- `fixtures/synthetic/cases/case_13_hypertension_followup.json`: the same transcript with roles, and what the note must (and must not) contain. It runs in the safety test suite.
