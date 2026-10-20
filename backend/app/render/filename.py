"""Neutral file names (Blueprint §10.2): no patient detail ever appears in them."""

from datetime import datetime


def neutral_file_name(when: datetime, fmt: str) -> str:
    return f"consultation_note_{when:%Y-%m-%d_%H%M}.{fmt}"
