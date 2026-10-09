"""Application settings, loaded from the environment (and an optional .env file)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="BS_", extra="ignore")

    # Server
    app_name: str = "Beancount Studio"
    environment: str = "development"
    log_level: str = "INFO"
    secret_key: str = Field(
        default="change-me-in-production",
        description="Used to sign password-reset tokens. Set a long random value.",
    )
    public_url: str = "http://localhost:3000"
    cors_origins: str = Field(
        default="http://localhost:3000",
        description="Comma-separated origins allowed to call the API directly from a browser.",
    )

    # Storage
    data_dir: Path = Path("./data")
    database_url: str = ""  # defaults to sqlite under data_dir

    # Accounts
    allow_signup: bool = True
    session_ttl_days: int = 30
    cookie_name: str = "bs_session"
    cookie_secure: bool = False

    # AI (optional). Leave the key empty to disable the assistant.
    anthropic_api_key: str = ""
    anthropic_base_url: str | None = None
    ai_model: str = "claude-opus-5-5"
    ai_fast_model: str = "claude-sonnet-5-5"
    ai_max_steps: int = 12

    # Email (optional). Leave smtp_host empty to disable password-reset email.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "Beancount Studio <noreply@localhost>"
    smtp_starttls: bool = True

    # Limits
    max_upload_bytes: int = 25 * 1024 * 1024
    bql_max_rows: int = 5000

    @property
    def cors_origin_list(self) -> list[str]:
        return [v.strip() for v in self.cors_origins.split(",") if v.strip()]

    @property
    def ledgers_dir(self) -> Path:
        return self.data_dir / "ledgers"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite+aiosqlite:///{(self.data_dir / 'studio.db').as_posix()}"

    @property
    def ai_enabled(self) -> bool:
        return bool(self.anthropic_api_key)

    @property
    def email_enabled(self) -> bool:
        return bool(self.smtp_host)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.ledgers_dir.mkdir(parents=True, exist_ok=True)
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    return settings
