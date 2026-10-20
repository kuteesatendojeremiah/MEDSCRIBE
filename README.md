# Mediscribe

Stateless clinical documentation prototype (Blueprint v3.0). A clinician records a consultation; the app
transcribes it, labels speakers, extracts facts with their source, builds one note, flags uncertainty, and
lets the clinician preview, approve and download a DOCX/PDF. **Nothing clinical is stored.**

**Synthetic data only.** Real speech/AI providers are disabled behind `PROVIDER_GATE_APPROVED=false`; the
deterministic mock is the default. This is a prototype for evaluation with fictional cases, not a medical
device and not cleared for real patients (see `docs/governance/`).

## Run it (development)

```
# backend (Python 3.11+)
cd backend && python -m venv .venv && .venv/Scripts/python -m pip install -e ".[dev]"
.venv/Scripts/python -m uvicorn app.main:app --port 8000

# frontend (Node 22+)
cd frontend && npm install && npm run dev      # http://localhost:5173, proxies /api to :8000
```

First run: the app asks you to create the first administrator account; the administrator then adds doctors
(**Doctors** button). Doctors sign in with their username and password. Open the app, tick the consent box, record (or upload a synthetic audio file), review the Kato example
(`fixtures/synthetic/`), approve and download.

## Try a worked example

`docs/examples/README.md` walks through a second, fictional consultation (hypertension follow-up) with an audio file you
can upload, the script to read aloud, and what the note should look like.

## Test with your own audio (local speech model)

```
backend\.venv\Scripts\python -m pip install -e "backend[local]"      # once: faster-whisper
powershell -ExecutionPolicy Bypass -File scripts\start_local.ps1       # opens http://localhost:8000
```

The header badge shows whether transcription is **MOCK** (always the demo consultation) or the **local
speech model**. Audio stays on your computer (the model files download once). Use fictional or your own
voice, never real patient audio. Whisper has no Luganda and no speaker identification: set roles by
clicking the role labels, then **Rebuild note from transcript**. See `docs/decisions/0005-local-speech-model.md`.

## Test it

| What | Command |
|---|---|
| Backend, safety, privacy tests | `cd backend && .venv/Scripts/python -m pytest -q` |
| Frontend unit tests | `cd frontend && npm test` |
| Browser end-to-end (needs Chrome) | `cd frontend && npx playwright test` |
| Lint | `make lint` |
| Privacy scan for the synthetic marker | `./scripts/privacy_scan.sh` |
| Evaluation report | `make eval` (writes `docs/evaluation/report.md`) |
| Load test | `make load` |

## Where things are

| Path | Contents |
|---|---|
| `docs/blueprint/` | the specification (source of truth), figures |
| `docs/build_plan.md`, `docs/progress.md` | plan and status |
| `docs/decisions/` | ADRs for every agreed deviation or interpretation |
| `docs/governance/` | data-flow map, provider gate form, DPPA mapping, incident response, compliance reports |
| `docs/evaluation/` | evaluation report, clinician guide, load test |
| `docs/deploy.md` | deployment and host hardening |
| `backend/app` | FastAPI app: providers, extraction + safety layer, render, security |
| `frontend/src` | React app: in-memory session store, screens |
| `tests/safety`, `tests/privacy`, `tests/load` | adversarial clinical-safety set, marker tests, load test |
| `fixtures/synthetic` | the Kato case, 12 further consultations, evaluation sets |

Project rules are in `CLAUDE.md`.
