"""Environment-driven settings (§13). Real providers stay off unless the gate is approved (§10.5)."""

from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Provider gate (§10.5, CLAUDE.md rule 7)
    provider_gate_approved: bool = False
    provider: str = "mock"
    # Real providers must ALSO be listed here before any adapter will run.
    provider_allow_list: list[str] = Field(default_factory=list)
    whisper_model: str = "small"  # local speech model size: tiny, base, small, medium

    # Auth (§10.4). Dev stub only; a real OIDC/SAML integration replaces dev login (ADR-0003).
    environment: str = "dev"
    # Demo sign-in for tests/demonstrations ONLY. Off by default; doctors sign in with accounts.
    dev_auth_enabled: bool = False
    accounts_file: Path = REPO_ROOT / "backend" / "data" / "accounts.json"
    login_max_failures: int = 5
    login_window_seconds: int = 300
    token_secret: str = ""  # empty -> random per process (restart invalidates tokens)
    token_ttl_seconds: int = 15 * 60  # matches the inactivity timeout (§6.2)
    token_absolute_seconds: int = 2 * 60 * 60  # absolute session limit (§6.2)

    # Limits (§10.4)
    max_upload_bytes: int = 50 * 1024 * 1024
    rate_limit_per_minute: int = 60
    max_json_bytes: int = 5 * 1024 * 1024  # /extract and /render request bodies

    # Synthetic data only until written approvals exist (§1.1, §11.1): exports say so.
    synthetic_only: bool = True

    fixtures_dir: Path = REPO_ROOT / "fixtures" / "synthetic"
    static_dir: Optional[Path] = None  # built frontend served by app.web (default frontend/dist)


@lru_cache
def get_settings() -> Settings:
    return Settings()
