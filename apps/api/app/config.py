"""Application settings, loaded from the environment (and an optional .env file)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
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

    # AI (optional). Two providers: Anthropic (official SDK) or any OpenAI-compatible server
    # (Ollama, vLLM, LM Studio, llama.cpp, OpenRouter, ...). "auto" picks Anthropic when a key is
    # set, otherwise the OpenAI-compatible server when a base URL is set, otherwise disabled.
    ai_provider: Literal["auto", "anthropic", "openai", "disabled"] = "auto"
    anthropic_api_key: str = ""
    anthropic_base_url: str | None = None
    openai_api_key: str = ""
    openai_base_url: str = ""
    ai_model: str = Field(
        default="", description="Chat model; defaults to claude-opus-5-5 on Anthropic"
    )
    ai_fast_model: str = Field(
        default="", description="Extraction/categorisation model; defaults to ai_model"
    )
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

    @field_validator("data_dir")
    @classmethod
    def _absolute_data_dir(cls, value: Path) -> Path:
        # Beancount's loader asserts absolute paths, so a relative BS_DATA_DIR must be resolved once.
        return value.expanduser().resolve()

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite+aiosqlite:///{(self.data_dir / 'studio.db').as_posix()}"

    @property
    def resolved_ai_provider(self) -> Literal["anthropic", "openai"] | None:
        if self.ai_provider == "disabled":
            return None
        if self.ai_provider == "anthropic":
            return "anthropic" if self.anthropic_api_key else None
        if self.ai_provider == "openai":
            return "openai" if self.openai_base_url and self.ai_model else None
        if self.anthropic_api_key:
            return "anthropic"
        if self.openai_base_url and self.ai_model:
            return "openai"
        return None

    @property
    def resolved_ai_model(self) -> str:
        if self.ai_model:
            return self.ai_model
        return "claude-opus-5-5" if self.resolved_ai_provider == "anthropic" else ""

    @property
    def resolved_ai_fast_model(self) -> str:
        return self.ai_fast_model or self.resolved_ai_model

    @property
    def ai_enabled(self) -> bool:
        return self.resolved_ai_provider is not None

    @property
    def email_enabled(self) -> bool:
        return bool(self.smtp_host)


@lru_cache
def get_settings() -> Settings:
    return Settings()
