"""Locust scenario for the same §15.3 load: one simulated clinician per user.

    pip install locust
    locust -f tests/load/locustfile.py --host http://127.0.0.1:8000 --users 20 --spawn-rate 5

`run_load.py` is the dependency-light equivalent that also records server memory and swap.
"""

import json
import os
from pathlib import Path

from locust import HttpUser, between, task

ROOT = Path(__file__).resolve().parents[2]
HEADER = json.loads((ROOT / "fixtures/synthetic/kato_expected_note.json").read_text("utf8"))[
    "header"
]
AUDIO = os.urandom(30 * 60 * 64_000 // 8)  # 30 minutes at 64 kbit/s


class Clinician(HttpUser):
    wait_time = between(1, 3)

    @task
    def consultation(self):
        tok = self.client.post("/auth/dev-login", json={"name": "Dr. Locust"}).json()["token"]
        h = {"Authorization": f"Bearer {tok}"}
        segs = self.client.post("/transcribe", data=AUDIO, headers=h).json()["segments"]
        self.client.post("/extract", json={"segments": segs, "header": HEADER}, headers=h)
        self.client.delete("/auth/session", headers=h)
