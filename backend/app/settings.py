"""Environment-driven settings (§13). Real providers stay off unless the gate is approved (§10.5)."""

from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

KNOWN_PROVIDERS = frozenset({"mock", "local_model", "cloud_speech", "local_whisper"})
REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    # hide_input_in_errors: a bad value (which could be a secret) is never echoed in the error (§10.1).
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", hide_input_in_errors=True)

    # Provider gate (§10.5, CLAUDE.md rule 7)
    provider_gate_approved: bool = False
    provider: str = "mock"
    # Real providers must ALSO be listed here before any adapter will run.
    provider_allow_list: list[str] = Field(default_factory=list)
    whisper_model: str = "small"  # local speech model size: tiny, base, small, medium
    # Provider calls are bounded (§6.3: a provider timeout is recoverable). Automatic retries only
    # apply to errors a provider marks retryable; default 0 so audio is never re-sent unasked.
    provider_timeout_seconds: int = Field(default=60, ge=1, le=600)
    provider_max_retries: int = Field(default=0, ge=0, le=2)

    # Auth (§10.4). Dev stub only; a real OIDC/SAML integration replaces dev login (ADR-0003).
    environment: str = "dev"
    # Demo sign-in for tests/demonstrations ONLY. Off by default; doctors sign in with accounts.
    dev_auth_enabled: bool = False
    accounts_file: Path = REPO_ROOT / "backend" / "data" / "accounts.json"
    login_max_failures: int = 5
    login_window_seconds: int = 300
    token_secret: str = ""  # empty -> random per process (restart invalidates tokens)
    token_ttl_seconds: int = Field(default=15 * 60, gt=0)  # matches the inactivity timeout (§6.2)
    token_absolute_seconds: int = Field(default=2 * 60 * 60, gt=0)  # absolute session limit (§6.2)

    # Limits (§10.4)
    max_upload_bytes: int = Field(default=50 * 1024 * 1024, gt=0)
    rate_limit_per_minute: int = Field(default=60, gt=0)
    max_json_bytes: int = Field(
        default=5 * 1024 * 1024, gt=0
    )  # /extract and /render request bodies

    # Synthetic data only until written approvals exist (§1.1, §11.1): exports say so.
    synthetic_only: bool = True

    fixtures_dir: Path = REPO_ROOT / "fixtures" / "synthetic"
    static_dir: Optional[Path] = None  # built frontend served by app.web (default frontend/dist)

    @field_validator("provider")
    @classmethod
    def _known_provider(cls, value: str) -> str:
        if value not in KNOWN_PROVIDERS:
            raise ValueError("provider is not a known provider name")
        return value

    @model_validator(mode="after")
    def _ttl_within_absolute(self) -> "Settings":
        if self.token_ttl_seconds > self.token_absolute_seconds:
            raise ValueError("token_ttl_seconds must not exceed token_absolute_seconds")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
