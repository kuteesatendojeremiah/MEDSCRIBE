"""Content-free logging (§10.1, FR-17): drop any record carrying clinical-content fields."""

import logging

BANNED_FIELDS = frozenset(
    {
        "text",
        "transcript",
        "audio",
        "note",
        "prompt",
        "content",
        "patient_label",
        "patient",
        "patient_name",
    }
)


class ClinicalContentFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if BANNED_FIELDS & set(vars(record)):
            return False
        if isinstance(record.args, dict) and BANNED_FIELDS & set(record.args):
            return False
        if isinstance(record.msg, dict) and BANNED_FIELDS & set(record.msg):
            return False
        return True


def _attach(target: logging.Filterer) -> None:
    if not any(isinstance(f, ClinicalContentFilter) for f in target.filters):
        target.addFilter(ClinicalContentFilter())


def configure_logging() -> None:
    """Attach the filter to the root logger and every handler (a logger filter does not apply
    to records propagated from child loggers, so handlers need it too)."""
    root = logging.getLogger()
    _attach(root)
    for handler in root.handlers:
        _attach(handler)
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        for handler in logging.getLogger(name).handlers:
            _attach(handler)
