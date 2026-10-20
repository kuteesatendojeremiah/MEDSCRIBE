import json
from pathlib import Path

NOTE_SCHEMA = json.loads((Path(__file__).parent / "note_schema.json").read_text(encoding="utf8"))
