"""Password hashing, opaque tokens, secrets encrypted at rest, and SSH keypairs."""

from __future__ import annotations

import base64
import hashlib
import secrets
from functools import lru_cache

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

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


# ------------------------------------------------------------- secrets at rest


class UndecryptableSecret(Exception):
    """The ciphertext was produced under a different BS_SECRET_KEY (or is corrupt)."""


@lru_cache(maxsize=4)
def _fernet(secret_key: str) -> Fernet:
    derived = HKDF(
        algorithm=hashes.SHA256(), length=32, salt=None, info=b"beancount-studio/stored-secrets"
    ).derive(secret_key.encode("utf-8"))
    return Fernet(base64.urlsafe_b64encode(derived))


def encrypt_secret(plaintext: str, secret_key: str) -> str:
    """Encrypt a credential for storage; the key is derived from the server's secret key."""
    return _fernet(secret_key).encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt_secret(ciphertext: str, secret_key: str) -> str:
    try:
        return _fernet(secret_key).decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError) as exc:
        raise UndecryptableSecret(
            "A stored credential cannot be decrypted; BS_SECRET_KEY has changed since it was saved"
        ) from exc


# ------------------------------------------------------------------ SSH keys


def generate_ssh_keypair(comment: str) -> tuple[str, str, str]:
    """Return (private key in OpenSSH format, public key line, SHA256 fingerprint)."""
    private = Ed25519PrivateKey.generate()
    private_text = private.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.OpenSSH,
        serialization.NoEncryption(),
    ).decode("ascii")
    public_line = (
        private.public_key()
        .public_bytes(serialization.Encoding.OpenSSH, serialization.PublicFormat.OpenSSH)
        .decode("ascii")
    )
    blob = base64.b64decode(public_line.split()[1])
    digest = base64.b64encode(hashlib.sha256(blob).digest()).decode("ascii").rstrip("=")
    return private_text, f"{public_line} {comment}", f"SHA256:{digest}"
