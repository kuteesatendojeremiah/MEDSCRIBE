"""Repeated deployment health check (spec §11 "deployment health checks"). Standard library only.

    python scripts/health_check.py https://mediscribe-9vyf.onrender.com --count 5 --interval 2 [--ready]

The first request may take up to a minute on a sleeping free-tier host, so it gets a long timeout.
Exit code 0 only if every check returned the expected content-free body. Prints status and timing,
never response bodies beyond the fixed expected value.
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.request


def fetch(url: str, timeout: float):
    start = time.monotonic()
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.status, r.read(2048), time.monotonic() - start
    except urllib.error.HTTPError as e:
        return e.code, b"", time.monotonic() - start
    except Exception:
        return 0, b"", time.monotonic() - start


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("base")
    ap.add_argument("--count", type=int, default=5)
    ap.add_argument("--interval", type=float, default=2.0)
    ap.add_argument("--ready", action="store_true", help="also check /api/ready")
    args = ap.parse_args()
    base = args.base.rstrip("/")
    failures = 0
    for i in range(args.count):
        status, body, secs = fetch(f"{base}/api/health", 90 if i == 0 else 15)
        ok = status == 200 and json.loads(body or b"{}") == {"status": "ok"}
        line = f"[{i + 1}/{args.count}] /api/health {status} {secs:.2f}s {'OK' if ok else 'FAIL'}"
        if args.ready:
            rs, rb, rsecs = fetch(f"{base}/api/ready", 15)
            rok = rs == 200 and json.loads(rb or b"{}").get("status") == "ready"
            line += f" | /api/ready {rs} {rsecs:.2f}s {'OK' if rok else 'FAIL'}"
            ok = ok and rok
        print(line)
        failures += 0 if ok else 1
        if i < args.count - 1:
            time.sleep(args.interval)
    print("PASS" if failures == 0 else f"FAIL ({failures} failed)")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
