"""CLI: python -m app.evaluation.run  ->  prints the WER / speaker-accuracy baseline table."""

from app.evaluation.metrics import evaluate_all, format_table
from app.settings import get_settings

if __name__ == "__main__":
    print(format_table(evaluate_all(get_settings())))
