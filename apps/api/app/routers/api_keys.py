"""Personal access tokens (bsk_...). Minting requires a browser session, never another key."""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter
from sqlalchemy import select

from app.core.deps import DbDep, SessionUserDep, UserDep
from app.core.security import hash_token, new_api_key
from app.db.models import ApiKey, Ledger, utcnow
from app.errors import NotFoundError, ValidationError
from app.schemas import ApiKeyCreateRequest, ApiKeyOut, MintedApiKeyOut

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


@router.get("", response_model=list[ApiKeyOut])
async def list_keys(user: UserDep, db: DbDep):
    rows = (
        (
            await db.execute(
                select(ApiKey).where(ApiKey.user_id == user.id).order_by(ApiKey.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [ApiKeyOut.model_validate(r) for r in rows]


@router.post("", response_model=MintedApiKeyOut, status_code=201)
async def create_key(body: ApiKeyCreateRequest, user: SessionUserDep, db: DbDep):
    if body.ledger_id:
        ledger = await db.get(Ledger, body.ledger_id)
        if ledger is None:
            raise NotFoundError("Ledger not found")
    scopes = sorted(set(body.scopes) | {"read"})
    if not scopes:
        raise ValidationError("At least one scope is required")
    key, prefix = new_api_key()
    row = ApiKey(
        user_id=user.id,
        name=body.name.strip(),
        key_prefix=prefix,
        key_hash=hash_token(key),
        scopes=scopes,
        ledger_id=body.ledger_id,
        expires_at=(utcnow() + timedelta(days=body.expires_in_days))
        if body.expires_in_days
        else None,
    )
    db.add(row)
    await db.commit()
    out = ApiKeyOut.model_validate(row).model_dump(by_alias=True)
    return MintedApiKeyOut(**out, key=key)


@router.delete("/{key_id}", response_model=ApiKeyOut)
async def revoke_key(key_id: str, user: SessionUserDep, db: DbDep):
    row = await db.get(ApiKey, key_id)
    if row is None or row.user_id != user.id:
        raise NotFoundError("API key not found")
    if row.revoked_at is None:
        row.revoked_at = utcnow()
        await db.commit()
    return ApiKeyOut.model_validate(row)
