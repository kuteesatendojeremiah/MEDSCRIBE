"""§15.2 / FR-17: a request carrying the synthetic marker leaves no trace in any log output."""

import logging

MARKER = "SYNTHETIC-MARKER-7Q4Z"


def test_marker_in_audio_and_headers_never_logged(client, auth, caplog, capfd):
    with caplog.at_level(logging.DEBUG):
        client.post(
            "/transcribe",
            content=(f"MOCKCASE:kato_transcript\n{MARKER}").encode(),
            headers={**auth, "X-Expected-Languages": MARKER},
        )
        client.post(
            "/transcribe",
            content=MARKER.encode() * 3,
            headers={"Authorization": "Bearer " + MARKER},
        )
        client.post("/auth/dev-login", json={"name": MARKER})
    out, err = capfd.readouterr()
    assert MARKER not in caplog.text
    assert MARKER not in out and MARKER not in err
