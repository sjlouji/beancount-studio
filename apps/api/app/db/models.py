"""Database models. Ledger *content* lives in git repos on disk; this is metadata only."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from app.db.base import Base


class UtcDateTime(TypeDecorator[datetime]):
    """Timezone-aware UTC datetimes even on SQLite, which stores them naive."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def new_id() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(UTC)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow, onupdate=utcnow)


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(120), default="")
    bio: Mapped[str] = mapped_column(Text, default="")
    website: Mapped[str] = mapped_column(String(255), default="")
    location: Mapped[str] = mapped_column(String(120), default="")
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    preferences: Mapped[dict] = mapped_column(JSON, default=dict)

    ledgers: Mapped[list[Ledger]] = relationship(back_populates="owner")


class Session(Base):
    __tablename__ = "sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(UtcDateTime())
    last_seen_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
    user_agent: Mapped[str] = mapped_column(String(255), default="")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(UtcDateTime())
    used_at: Mapped[datetime | None] = mapped_column(UtcDateTime(), nullable=True)


class Ledger(TimestampMixin, Base):
    __tablename__ = "ledgers"
    __table_args__ = (UniqueConstraint("owner_id", "slug", name="uq_ledger_owner_slug"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    slug: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    visibility: Mapped[str] = mapped_column(String(10), default="private")  # private | public
    main_file: Mapped[str] = mapped_column(String(255), default="main.bean")
    stars_count: Mapped[int] = mapped_column(Integer, default=0)

    owner: Mapped[User] = relationship(back_populates="ledgers")
    collaborators: Mapped[list[LedgerCollaborator]] = relationship(
        back_populates="ledger", cascade="all, delete-orphan"
    )
    # Loaded with the ledger (one extra query per result set) so listings never do N+1.
    remote: Mapped[LedgerRemote | None] = relationship(
        back_populates="ledger", uselist=False, lazy="selectin", cascade="all, delete-orphan"
    )


class LedgerRemote(TimestampMixin, Base):
    """The repository a ledger is pushed to after every commit and pulled from on demand.

    Credentials are encrypted at rest (see app.core.security); the URL never carries them.
    """

    __tablename__ = "ledger_remotes"

    ledger_id: Mapped[str] = mapped_column(
        ForeignKey("ledgers.id", ondelete="CASCADE"), primary_key=True
    )
    url: Mapped[str] = mapped_column(String(512))
    transport: Mapped[str] = mapped_column(String(8))  # https | ssh | local
    auth: Mapped[str] = mapped_column(String(8))  # none | token | ssh_key
    token_ciphertext: Mapped[str | None] = mapped_column(Text, nullable=True)
    branch: Mapped[str] = mapped_column(String(120))
    # in_sync | pushing | behind | diverged | error
    state: Mapped[str] = mapped_column(String(12), default="in_sync")
    last_pushed_sha: Mapped[str | None] = mapped_column(String(40), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(UtcDateTime(), nullable=True)
    last_error: Mapped[str] = mapped_column(Text, default="")

    ledger: Mapped[Ledger] = relationship(back_populates="remote")


class UserSshKey(Base):
    """One keypair per person, generated here; the public half is added to their git host once."""

    __tablename__ = "user_ssh_keys"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    public_key: Mapped[str] = mapped_column(Text)
    private_key_ciphertext: Mapped[str] = mapped_column(Text)
    fingerprint: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)


class LedgerCollaborator(Base):
    __tablename__ = "ledger_collaborators"

    ledger_id: Mapped[str] = mapped_column(
        ForeignKey("ledgers.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(10), default="read")  # read | write | admin
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)

    ledger: Mapped[Ledger] = relationship(back_populates="collaborators")
    user: Mapped[User] = relationship()


class LedgerStar(Base):
    __tablename__ = "ledger_stars"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    ledger_id: Mapped[str] = mapped_column(
        ForeignKey("ledgers.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    key_prefix: Mapped[str] = mapped_column(String(16))
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    scopes: Mapped[list] = mapped_column(JSON, default=list)  # ["read"] | ["read","write"]
    ledger_id: Mapped[str | None] = mapped_column(
        ForeignKey("ledgers.id", ondelete="CASCADE"), nullable=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(UtcDateTime(), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(UtcDateTime(), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(UtcDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)


class ChatThread(TimestampMixin, Base):
    __tablename__ = "chat_threads"
    __table_args__ = (Index("ix_chat_threads_ledger_user", "ledger_id", "user_id"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    ledger_id: Mapped[str] = mapped_column(ForeignKey("ledgers.id", ondelete="CASCADE"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200), default="New conversation")
    messages: Mapped[list] = mapped_column(JSON, default=list)  # assistant-ui ThreadMessageLike[]


class DesktopSignIn(Base):
    """A browser-approved sign-in waiting to be redeemed by the desktop app.

    The app keeps a random verifier and sends only its SHA-256 (`challenge`) to the browser; the
    signed-in person approves that challenge; the app then exchanges the verifier for a session.
    Rows are single-use: deleted on exchange, or when found expired.
    """

    __tablename__ = "desktop_sign_ins"

    challenge: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(UtcDateTime())


class Upload(Base):
    """A temporary upload (receipt image, statement) owned by a user."""

    __tablename__ = "uploads"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    ledger_id: Mapped[str | None] = mapped_column(
        ForeignKey("ledgers.id", ondelete="CASCADE"), nullable=True
    )
    filename: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(120))
    size: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
