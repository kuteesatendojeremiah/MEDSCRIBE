"""Load and reliability test (Blueprint §15.3): N concurrent clinicians, each sending a recording the
size of a 30-minute consultation, then extraction and export. Reports server memory and swap.

    python tests/load/run_load.py --clinicians 20 --minutes 30 --out docs/evaluation/load_test.md

Synthetic data only. Audio is random bytes sized like a 64 kbit/s recording (about 14 MB for 30 min).
Run from the backend virtualenv (needs httpx and psutil). Results describe THIS host only.
"""

import argparse
import json
import os
import platform
import statistics
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import psutil

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))
PORT = 8765
BASE = f"http://127.0.0.1:{PORT}"


def start_server() -> subprocess.Popen:
    env = {
        **os.environ,
        "RATE_LIMIT_PER_MINUTE": "100000",
        "DEV_AUTH_ENABLED": "true",
        "MAX_UPLOAD_BYTES": str(80 * 1024 * 1024),
    }
    py = BACKEND / ".venv" / ("Scripts" if os.name == "nt" else "bin") / "python"
    proc = subprocess.Popen(
        [
            str(py),
            "-m",
            "uvicorn",
            "app.main:app",
            "--port",
            str(PORT),
            "--log-level",
            "warning",
        ],
        cwd=BACKEND,
        env=env,
    )
    for _ in range(100):
        try:
            if httpx.get(f"{BASE}/health", timeout=1).status_code == 200:
                return proc
        except httpx.HTTPError:
            time.sleep(0.2)
    proc.kill()
    raise SystemExit("server did not start")


def one_clinician(i: int, audio: bytes, header: dict, segments_note: dict, results: list):
    t0 = time.perf_counter()
    ok = False
    try:
        with httpx.Client(base_url=BASE, timeout=120) as c:
            tok = c.post("/auth/dev-login", json={"name": f"Dr. Load {i}"}).json()["token"]
            h = {"Authorization": f"Bearer {tok}"}
            t = c.post("/transcribe", content=audio, headers=h)
            t.raise_for_status()
            segs = t.json()["segments"]
            e = c.post("/extract", json={"segments": segs, "header": header}, headers=h)
            e.raise_for_status()
            note = e.json()["note"]
            for r in note["review_items"]:
                if r["level"] == "HIGH":
                    r["status"] = "unverified"
            from app.render.hash import note_hash

            f = c.post(
                "/render?mode=final&format=docx",
                json={"note": note, "approved_hash": note_hash(note)},
                headers=h,
            )
            f.raise_for_status()
            c.delete("/auth/session", headers=h)
            ok = f.content[:2] == b"PK"
    except Exception:  # content-free: only success/failure is recorded
        ok = False
    results.append((ok, time.perf_counter() - t0))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clinicians", type=int, default=20)
    ap.add_argument("--minutes", type=int, default=30)
    ap.add_argument("--out", default="")
    a = ap.parse_args()

    audio = os.urandom(int(a.minutes * 60 * 64_000 / 8))  # 64 kbit/s
    header = json.loads((ROOT / "fixtures/synthetic/kato_expected_note.json").read_text("utf8"))[
        "header"
    ]
    proc = start_server()
    launcher = psutil.Process(proc.pid)

    def server_rss() -> int:
        """Resident memory of the server process tree (the venv launcher spawns the real server)."""
        total = 0
        for p in [launcher, *launcher.children(recursive=True)]:
            try:
                total += p.memory_info().rss
            except psutil.Error:
                pass
        return total

    swap_before = psutil.swap_memory()
    rss_idle = server_rss()
    peak = [rss_idle]
    stop = threading.Event()

    def sample():
        while not stop.is_set():
            try:
                peak[0] = max(peak[0], server_rss())
            except psutil.Error:
                break
            time.sleep(0.02)

    sampler = threading.Thread(target=sample, daemon=True)
    sampler.start()
    results: list = []
    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=a.clinicians) as pool:
        for i in range(a.clinicians):
            pool.submit(one_clinician, i, audio, header, None, results)
    wall = time.perf_counter() - t0
    stop.set()
    sampler.join()
    time.sleep(0.5)
    rss_after = server_rss()
    swap_after = psutil.swap_memory()
    proc.kill()

    ok = [r for r in results if r[0]]
    lat = sorted(t for _, t in results)
    mb = 1024 * 1024
    report = {
        "host": f"{platform.system()} {platform.release()}, {psutil.cpu_count()} CPUs, "
        f"{psutil.virtual_memory().total // mb} MB RAM",
        "clinicians": a.clinicians,
        "recording_minutes": a.minutes,
        "audio_mb_each": round(len(audio) / mb, 1),
        "success_rate": f"{len(ok)}/{len(results)} ({100 * len(ok) / max(1, len(results)):.1f}%)",
        "wall_seconds": round(wall, 1),
        "latency_s_median": round(statistics.median(lat), 2),
        "latency_s_max": round(lat[-1], 2),
        "server_rss_idle_mb": round(rss_idle / mb),
        "server_rss_peak_mb": round(peak[0] / mb),
        "server_rss_after_mb": round(rss_after / mb),
        "swap_used_before_mb": round(swap_before.used / mb),
        "swap_used_after_mb": round(swap_after.used / mb),
        "swap_in_out_mb": round(
            (swap_after.sin - swap_before.sin + swap_after.sout - swap_before.sout) / mb
        ),
        "note": "swap in/out counters are not reported by Windows; on a Linux processing host swap is "
        "disabled (docs/deploy.md), so the expected value is 0 and swap_used must be 0",
    }
    print(json.dumps(report, indent=2))
    if a.out:
        lines = [
            "# Load test (Blueprint §15.3)",
            "",
            "Synthetic data only; results describe the host below, not production.",
            "",
        ]
        lines += ["| Measure | Value |", "|---|---|"] + [
            f"| {k} | {v} |" for k, v in report.items()
        ]
        Path(a.out).write_text("\n".join(lines) + "\n", encoding="utf8")
    if len(ok) != len(results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
