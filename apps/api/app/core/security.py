"""Password hashing and opaque token generation/hashing."""

from __future__ import annotations

import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def new_token(prefix: str = "") -> str:
    return f"{prefix}{secrets.token_urlsafe(32)}"


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_api_key() -> tuple[str, str]:
    """Return (plaintext key, display prefix)."""
    raw = secrets.token_urlsafe(30)
    key = f"bsk_{raw}"
    return key, key[:12]
