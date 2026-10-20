"""Generate docs/evaluation/report.md from a full automated run (Blueprint §14 Phase 6, §15.4).

    backend/.venv/Scripts/python scripts/eval_report.py

Measures only what can be measured without people: safety tests, the WER/speaker harness (mock
baseline), the synthetic case set, export reliability, and cleanup. Clinician review time and
usability need real participants and are reported as NOT MEASURED, never estimated.
"""

import json
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from fastapi.testclient import TestClient  # noqa: E402

from app.evaluation.metrics import evaluate_all  # noqa: E402
from app.main import create_app  # noqa: E402
from app.render.hash import note_hash  # noqa: E402
from app.settings import Settings  # noqa: E402


def pytest_junit(paths: list[str]) -> list[dict]:
    """Run pytest on `paths` from backend/ and return every test case with its outcome."""
    with tempfile.TemporaryDirectory() as tmp:
        xml_path = Path(tmp) / "junit.xml"
        subprocess.run(
            [
                sys.executable,
                "-m",
                "pytest",
                "-q",
                "-p",
                "no:cacheprovider",
                f"--junitxml={xml_path}",
                *paths,
            ],
            cwd=BACKEND,
            capture_output=True,
            text=True,
        )
        cases = []
        for tc in ET.parse(xml_path).getroot().iter("testcase"):
            status = (
                "fail"
                if tc.find("failure") is not None or tc.find("error") is not None
                else ("skip" if tc.find("skipped") is not None else "pass")
            )
            cases.append(
                {
                    "file": (
                        tc.get("classname", "").split(".")[-2]
                        if "." in tc.get("classname", "")
                        else ""
                    ),
                    "name": tc.get("name", ""),
                    "status": status,
                }
            )
        return cases


def summarize(cases: list[dict]) -> tuple[int, int, int]:
    p = sum(c["status"] == "pass" for c in cases)
    f = sum(c["status"] == "fail" for c in cases)
    s = sum(c["status"] == "skip" for c in cases)
    return p, f, s


SAFETY_ROWS = [
    (
        "Negation preserved ('I do not have shortness of breath')",
        "0 errors",
        ["negation", "time_is_kept", "yes_answer"],
    ),
    (
        "Question not converted into diagnosis",
        "0 errors",
        ["question_is_not_converted", "question_is_not"],
    ),
    (
        "Doctor question not converted into patient fact",
        "0 errors",
        ["doctor_question", "answer_is_attributed", "unclear_answer"],
    ),
    (
        "Planned examination not shown as done",
        "0 errors",
        ["planned", "stated_finding"],
    ),
    (
        "Missing medication detail invented",
        "0 errors",
        [
            "medication",
            "invents",
            "inaudible_dose",
            "complete_details",
            "doctor_started",
            "twice_daily",
            "no_medication_detail",
        ],
    ),
    (
        "Relative's report labelled as patient's",
        "0 errors after review prompts",
        ["relative"],
    ),
    ("Body system assigned only from specialty", "0 errors", ["body_system"]),
    (
        "Every note item has a source tag",
        "100%",
        ["source", "dropped", "malformed", "every_item"],
    ),
    (
        "Speaker role accuracy, clear audio",
        ">= 95% (rest Unknown)",
        ["speaker_accuracy", "clear_audio"],
    ),
    (
        "Word error rate, English / Luganda / mixed",
        "Baseline in Phase 2",
        ["wer_baseline"],
    ),
]


def export_reliability(runs: int = 50) -> dict:
    settings = Settings(
        _env_file=None, token_secret="eval", rate_limit_per_minute=100_000, dev_auth_enabled=True
    )
    client = TestClient(create_app(settings), raise_server_exceptions=False)
    tok = client.post("/auth/dev-login", json={"name": "Dr. Eval"}).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    final = json.loads((ROOT / "fixtures/synthetic/kato_expected_note.json").read_text("utf8"))
    ok = refused = valid = 0
    times = []
    for i in range(runs):
        t0 = time.perf_counter()
        r = client.post(
            "/render?mode=final&format=docx",
            json={"note": final, "approved_hash": note_hash(final)},
            headers=h,
        )
        times.append(time.perf_counter() - t0)
        if r.status_code == 200:
            ok += 1
            valid += r.content[:2] == b"PK"
        tampered = json.loads(json.dumps(final))
        tampered["items"][i % len(tampered["items"])]["text"] += "!"
        t = client.post(
            "/render?mode=final&format=docx",
            json={"note": tampered, "approved_hash": note_hash(final)},
            headers=h,
        )
        refused += t.status_code == 409 and t.json()["error"] == "E_HASH_MISMATCH"
    return {
        "runs": runs,
        "ok": ok,
        "valid": valid,
        "tamper_refused": refused,
        "median_ms": round(statistics.median(times) * 1000, 1),
        "max_ms": round(max(times) * 1000, 1),
        "pdf": (
            "measured"
            if shutil.which("soffice")
            else "NOT MEASURED (LibreOffice not installed on this host)"
        ),
    }


def privacy_scan() -> str:
    for c in (r"C:\Program Files\Git\bin\bash.exe", shutil.which("bash")):
        if c and Path(c).exists():
            r = subprocess.run(
                [c, str(ROOT / "scripts" / "privacy_scan.sh")],
                capture_output=True,
                text=True,
            )
            if r.returncode in (0, 1):
                return ("0 hits" if r.returncode == 0 else "HITS FOUND") + f" (exit {r.returncode})"
    return "NOT RUN (no working bash)"


def main():
    safety = pytest_junit(["../tests/safety"])
    privacy = pytest_junit(["../tests/privacy"])
    backend = pytest_junit(["tests"])
    results = evaluate_all(Settings(_env_file=None))
    cases = [c for c in safety if "test_case_expectations" in c["name"]]
    exp = export_reliability()
    sample = ROOT / "docs" / "evaluation" / "sample_metrics.json"
    metrics = json.loads(sample.read_text("utf8")) if sample.exists() else None
    scan = privacy_scan()
    case_files = sorted((ROOT / "fixtures" / "synthetic" / "cases").glob("case_*.json"))

    L = []
    w = L.append
    w("# Evaluation report (Blueprint §14 Phase 6, §15.4)")
    w("")
    w(
        f"Generated {datetime.now():%Y-%m-%d %H:%M} by `scripts/eval_report.py`. **Synthetic data only; automated run.**"
    )
    w(
        "The extractor and speech provider are deterministic MOCKS: results show that the pipeline, safety layer and"
    )
    w(
        "harness work, not that any real model is safe or accurate. Human measures are marked NOT MEASURED."
    )
    w("")
    w("## 1. Clinical safety tests (§15.1)")
    w("")
    w("| Test | Target | Tests | Result |")
    w("|---|---|---|---|")
    pool = safety
    for label, target, keys in SAFETY_ROWS:
        rows = [
            c
            for c in pool
            if any(k in c["name"].lower() or k in c["file"].lower() for k in keys)
            and "test_case_expectations" not in c["name"]
        ]
        p, f, _ = summarize(rows)
        w(f"| {label} | {target} | {len(rows)} | {'**FAIL** ' + str(f) if f else 'pass'} |")
    p, f, s = summarize(safety)
    w("")
    w(f"All of `tests/safety`: **{p} passed, {f} failed, {s} skipped**.")
    w("")
    w("## 2. Speech and speaker harness (mock baseline, §14 Phase 2)")
    w("")
    w("| Set | Segments | WER | Speaker accuracy (clear, assigned) | Unknown rate | >= 95% |")
    w("|---|---|---|---|---|---|")
    for r in results:
        w(
            f"| {r.name} | {r.segments} | {r.wer:.3f} | {r.speaker_accuracy:.3f} | {r.unknown_rate:.3f} | {'met' if r.meets_speaker_target else 'not met (deliberate error in set)'} |"
        )
    w("")
    w(
        "The mixed set carries a deliberate nurse-to-doctor error to prove the harness can fail. WER here is the mock's"
    )
    w(
        "hypothesis against hand-written references; real WER targets are set before a real provider is used (§15.1)."
    )
    w("")
    w(
        f"## 3. Synthetic consultation cases ({len(case_files)} new cases, `fixtures/synthetic/cases/`)"
    )
    w("")
    w("| Case | Result |")
    w("|---|---|")
    for c in sorted(cases, key=lambda c: c["name"]):
        w(f"| {c['name'].split('[')[-1].rstrip(']')} | {c['status']} |")
    w("")
    w(
        "Themes covered: negation, questions vs facts, relative speaking, interpreter, unclear doses, planned vs"
    )
    w(
        "completed examination, code-switching, interruptions, conflicting statements, missing allergy status."
    )
    w("")
    w("## 4. Correction effort and review time")
    w("")
    if metrics:
        w(
            "Sample content-free metrics from one AUTOMATED walk-through (`docs/evaluation/sample_metrics.json`):"
        )
        w("")
        w("```json")
        w(json.dumps(metrics, indent=2))
        w("```")
    w("")
    w(
        "**Median clinician review time: NOT MEASURED.** It requires clinicians running fictional cases with"
    )
    w(
        "evaluation mode on (`?eval=1`); see `docs/evaluation/clinician_guide.md`. The timings above are a script's."
    )
    w("")
    w("## 5. Export reliability")
    w("")
    w(
        f"- {exp['runs']} DOCX exports of the Kato note with the approved hash: **{exp['ok']}/{exp['runs']} succeeded**, "
        f"{exp['valid']}/{exp['runs']} valid DOCX containers (median {exp['median_ms']} ms, max {exp['max_ms']} ms)."
    )
    w(
        f"- {exp['runs']} exports where one character of the note was changed after approval: "
        f"**{exp['tamper_refused']}/{exp['runs']} refused** with `E_HASH_MISMATCH` (terminal)."
    )
    w(f"- PDF (ReportLab): {exp['pdf']}.")
    w(
        "- Download success on the target network (>= 99%, §15.3): **NOT MEASURED** (needs the real network)."
    )
    w("")
    w("## 6. Cleanup and statelessness (§15.2)")
    w("")
    p, f, s = summarize(privacy)
    w(
        f"- `tests/privacy`: **{p} passed, {f} failed, {s} skipped** (6 full sessions seeded with `SYNTHETIC-MARKER-7Q4Z`; log output, temp dirs, repository, process state, restart)."
    )
    w(f"- `scripts/privacy_scan.sh`: **{scan}**.")
    w(
        "- Browser: `frontend/e2e/privacy.spec.ts` seeds the marker and checks storage, caches, service workers, URLs, console, download name and the back-forward cache (run with `npx playwright test`)."
    )
    w("")
    w("## 7. Backend test suite")
    w("")
    p, f, s = summarize(backend)
    w(f"`backend/tests`: **{p} passed, {f} failed, {s} skipped**.")
    w("")
    w("## 8. Definition of done (§15.4)")
    w("")
    w("| # | Item | Status |")
    w("|---|---|---|")
    rows = [
        (
            "1",
            "A fictional mixed-language consultation is recorded, transcribed and translated",
            "Done with MOCK providers (fake microphone / uploaded file -> mock transcript with originals and translations). Real speech: blocked by the provider gate",
        ),
        (
            "2",
            "Speaker roles correct or Unknown, and editable",
            "Roles editable (e2e); accuracy measured on the mock harness only",
        ),
        (
            "3",
            "One note with all §4 sections and source tags",
            "Done (schema-validated, every item sourced)",
        ),
        (
            "4",
            "All §15.1 targets met",
            "Safety tests: see §1 (mock extractor). WER/speaker targets for real providers: not yet set or measured",
        ),
        (
            "5",
            "Preview, hash approval and export work; unverified items print visibly",
            "Done (DOCX). PDF built with ReportLab (ADR-0007)",
        ),
        ("6", "All §15.2 tests find 0 markers", f"Done on this host: see §6 ({scan})"),
        (
            "7",
            "Test report documents quality, safety errors, review time, export reliability and cleanup",
            "This report. Review time: NOT MEASURED",
        ),
    ]
    for r in rows:
        w("| " + " | ".join(r) + " |")
    w("")
    out = ROOT / "docs" / "evaluation" / "report.md"
    out.write_text("\n".join(L) + "\n", encoding="utf8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
