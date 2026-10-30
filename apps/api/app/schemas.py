"""Pydantic request/response models for the metadata API (auth, users, ledgers, keys)."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

USERNAME_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$")
SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$")
# Same shape as a username, so a person's name can double as their workspace address.
WORKSPACE_SLUG_RE = USERNAME_RE
# The web client serves workspace pages at /w/<workspace>/<name>; a ledger cannot sit there.
RESERVED_LEDGER_SLUGS = frozenset({"settings", "new", "members", "invites", "activity", "search"})
FISCAL_YEAR_END_RE = re.compile(r"^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$")


def valid_workspace_slug(value: str) -> bool:
    return len(value) >= 3 and WORKSPACE_SLUG_RE.match(value) is not None


def ledger_slug_error(value: str) -> str | None:
    """Why `value` cannot be a ledger slug, or None when it can."""
    if not SLUG_RE.match(value):
        return "Slug must be lowercase letters, digits or hyphens"
    if value in RESERVED_LEDGER_SLUGS:
        return f"'{value}' is the address of a workspace page; choose another slug"
    return None


def slugify(value: str, max_length: int = 80) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:max_length].strip("-")


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


# ----------------------------------------------------------------------- auth
class SignUpRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=40)
    password: str = Field(min_length=8, max_length=200)
    display_name: str = Field(default="", max_length=120, alias="displayName")

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


# ------------------------------------------------------------------ workspaces
WorkspaceRoleName = Literal["owner", "admin", "member", "viewer"]


def _workspace_slug(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip().lower()
    if not valid_workspace_slug(value):
        raise ValueError("Use 3-40 lowercase letters, digits or hyphens")
    return value


class WorkspaceCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: str | None = Field(default=None, max_length=40)

    @field_validator("slug")
    @classmethod
    def _slug(cls, value: str | None) -> str | None:
        return _workspace_slug(value)


class WorkspaceUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    slug: str | None = Field(default=None, max_length=40)

    @field_validator("slug")
    @classmethod
    def _slug(cls, value: str | None) -> str | None:
        return _workspace_slug(value)


class WorkspaceOut(BaseModel):
    id: str
    slug: str
    name: str
    role: str
    members_count: int = Field(alias="membersCount")
    ledgers_count: int = Field(alias="ledgersCount")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


class MemberOut(BaseModel):
    username: str
    display_name: str = Field(alias="displayName")
    role: str
    joined_at: datetime = Field(alias="joinedAt")

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


class MemberRoleRequest(BaseModel):
    role: WorkspaceRoleName


class InviteCreateRequest(BaseModel):
    role: Literal["admin", "member", "viewer"] = "member"
    expires_in_days: int = Field(default=7, ge=1, le=90, alias="expiresInDays")

    model_config = ConfigDict(populate_by_name=True)


class InviteOut(BaseModel):
    id: str
    role: str
    uses: int
    created_by: str | None = Field(alias="createdBy")
    expires_at: datetime = Field(alias="expiresAt")
    created_at: datetime = Field(alias="createdAt")

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


class MintedInviteOut(InviteOut):
    """The link is shown once; only its hash is kept."""

    url: str


class InvitePreviewOut(BaseModel):
    workspace_slug: str = Field(alias="workspaceSlug")
    workspace_name: str = Field(alias="workspaceName")
    role: str
    invited_by: str | None = Field(alias="invitedBy")
    expires_at: datetime = Field(alias="expiresAt")
    already_member: bool = Field(alias="alreadyMember")

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


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
    # MM-DD, written as Fava's fiscal-year-end option; unset means the calendar year.
    fiscal_year_end: str | None = Field(default=None, alias="fiscalYearEnd", max_length=5)
    # When set, the ledger is cloned from this repository instead of created from a template.
    source: LedgerSourceRequest | None = None

    model_config = ConfigDict(populate_by_name=True)

    @field_validator("currency")
    @classmethod
    def _currency(cls, value: str) -> str:
        value = value.strip().upper()
        if not re.match(r"^[A-Z][A-Z0-9'._-]{0,23}$", value):
            raise ValueError("Invalid currency code")
        return value

    @field_validator("fiscal_year_end")
    @classmethod
    def _fiscal_year_end(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not FISCAL_YEAR_END_RE.match(value):
            raise ValueError("Fiscal year end must be MM-DD, for example 06-30")
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
    workspace: str
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
