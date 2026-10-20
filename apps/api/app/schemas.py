"""Pydantic request/response models for the metadata API (auth, users, ledgers, keys)."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

USERNAME_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$")
SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$")


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


# ----------------------------------------------------------------------- auth
class SignUpRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=40)
    password: str = Field(min_length=8, max_length=200)
    display_name: str = Field(default="", max_length=120, alias="displayName")
    create_example_ledger: bool = Field(default=True, alias="createExampleLedger")

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("username")
    @classmethod
    def _username(cls, value: str) -> str:
        value = value.strip().lower()
        if not USERNAME_RE.match(value):
            raise ValueError("Use 3-40 lowercase letters, digits or hyphens")
        return value


class LoginRequest(BaseModel):
    identifier: str = Field(description="Email or username")
    password: str


class DesktopApproveRequest(BaseModel):
    challenge: str = Field(
        pattern=r"^[0-9a-f]{64}$", description="SHA-256 hex of the desktop app's verifier"
    )


class DesktopExchangeRequest(BaseModel):
    verifier: str = Field(min_length=32, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=200)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(alias="currentPassword")
    new_password: str = Field(min_length=8, max_length=200, alias="newPassword")

    model_config = ConfigDict(populate_by_name=True)


class UserOut(ApiModel):
    id: str
    email: str
    username: str
    display_name: str = Field(alias="displayName")
    bio: str = ""
    website: str = ""
    location: str = ""
    is_admin: bool = Field(alias="isAdmin")
    preferences: dict[str, Any] = {}
    created_at: datetime = Field(alias="createdAt")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)


class PublicUserOut(ApiModel):
    username: str
    display_name: str = Field(alias="displayName")
    bio: str = ""
    website: str = ""
    location: str = ""
    created_at: datetime = Field(alias="createdAt")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)


class UpdateProfileRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=120, alias="displayName")
    bio: str | None = Field(default=None, max_length=2000)
    website: str | None = Field(default=None, max_length=255)
    location: str | None = Field(default=None, max_length=120)
    username: str | None = Field(default=None, min_length=3, max_length=40)
    preferences: dict[str, Any] | None = None

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("username")
    @classmethod
    def _username(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip().lower()
        if not USERNAME_RE.match(value):
            raise ValueError("Use 3-40 lowercase letters, digits or hyphens")
        return value


class DeleteAccountRequest(BaseModel):
    password: str


# --------------------------------------------------------------------- ledgers
class RemoteConnectRequest(BaseModel):
    """A repository to connect to: where it is and how Studio may reach it."""

    url: str = Field(min_length=1, max_length=512)
    auth: Literal["none", "token", "ssh_key"] = "none"
    token: str | None = Field(default=None, max_length=512)


class LedgerSourceRequest(RemoteConnectRequest):
    main_file: str | None = Field(default=None, max_length=255, alias="mainFile")

    model_config = ConfigDict(populate_by_name=True)


class LedgerCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    slug: str | None = Field(default=None, max_length=80)
    description: str = Field(default="", max_length=2000)
    visibility: Literal["private", "public"] = "private"
    template: Literal["blank", "starter", "example"] = "starter"
    currency: str = Field(default="USD", min_length=1, max_length=24)
    # When set, the ledger is cloned from this repository instead of created from a template.
    source: LedgerSourceRequest | None = None

    @field_validator("currency")
    @classmethod
    def _currency(cls, value: str) -> str:
        value = value.strip().upper()
        if not re.match(r"^[A-Z][A-Z0-9'._-]{0,23}$", value):
            raise ValueError("Invalid currency code")
        return value


class LedgerUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    slug: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=2000)
    visibility: Literal["private", "public"] | None = None


class RemoteOut(BaseModel):
    url: str
    transport: str
    auth: str
    branch: str
    state: str
    last_pushed_sha: str | None = Field(alias="lastPushedSha")
    last_synced_at: datetime | None = Field(alias="lastSyncedAt")
    last_error: str = Field(alias="lastError")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)


class SshKeyOut(BaseModel):
    """The account's SSH key; the private half never leaves the server."""

    public_key: str = Field(alias="publicKey")
    fingerprint: str
    created_at: datetime = Field(alias="createdAt")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)


class RemoteResolveRequest(BaseModel):
    keep: Literal["local", "remote"]


class GitTestOut(BaseModel):
    default_branch: str | None = Field(alias="defaultBranch")

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


class LedgerOut(BaseModel):
    id: str
    owner: str
    slug: str
    title: str
    description: str
    visibility: str
    role: str
    can_write: bool = Field(alias="canWrite")
    can_admin: bool = Field(alias="canAdmin")
    is_starred: bool = Field(alias="isStarred")
    stars_count: int = Field(alias="starsCount")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    last_commit: dict[str, Any] | None = Field(default=None, alias="lastCommit")
    remote: RemoteOut | None = None

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


class CollaboratorUpsertRequest(BaseModel):
    role: Literal["read", "write", "admin"] = "read"


class CollaboratorOut(BaseModel):
    username: str
    display_name: str = Field(alias="displayName")
    role: str
    created_at: datetime = Field(alias="createdAt")

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


# -------------------------------------------------------------------- api keys
class ApiKeyCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    scopes: list[Literal["read", "write"]] = ["read"]
    ledger_id: str | None = Field(default=None, alias="ledgerId")
    expires_in_days: int | None = Field(default=None, ge=1, le=3650, alias="expiresInDays")

    model_config = ConfigDict(populate_by_name=True)


class ApiKeyOut(BaseModel):
    id: str
    name: str
    key_prefix: str = Field(alias="keyPrefix")
    scopes: list[str]
    ledger_id: str | None = Field(alias="ledgerId")
    expires_at: datetime | None = Field(alias="expiresAt")
    revoked_at: datetime | None = Field(alias="revokedAt")
    last_used_at: datetime | None = Field(alias="lastUsedAt")
    created_at: datetime = Field(alias="createdAt")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True, serialize_by_alias=True)


class MintedApiKeyOut(ApiKeyOut):
    key: str


# ---------------------------------------------------------------------- system
class SystemInfo(BaseModel):
    app_name: str = Field(alias="appName")
    version: str
    ai_enabled: bool = Field(alias="aiEnabled")
    ai_provider: str | None = Field(default=None, alias="aiProvider")
    ai_model: str | None = Field(default=None, alias="aiModel")
    email_enabled: bool = Field(alias="emailEnabled")
    signup_enabled: bool = Field(alias="signupEnabled")
    has_users: bool = Field(alias="hasUsers")

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)
