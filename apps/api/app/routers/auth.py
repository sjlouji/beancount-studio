"""Sign-up, login, logout, password reset."""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Request, Response
from sqlalchemy import func, select

from app.core.deps import AuthDep, DbDep, SessionUserDep, SettingsDep, author_for
from app.core.mailer import send_email
from app.core.security import hash_password, hash_token, new_token, verify_password
from app.db.models import Ledger, PasswordResetToken, Session, User, utcnow
from app.errors import (
    ConflictError,
    FeatureDisabledError,
    ForbiddenError,
    UnauthorizedError,
    ValidationError,
)
from app.ledgers.store import get_store
from app.logging_setup import get_logger
from app.schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    ResetPasswordRequest,
    SignUpRequest,
    UserOut,
)

log = get_logger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


def _set_session_cookie(response: Response, token: str, settings) -> None:
    response.set_cookie(
        settings.cookie_name,
        token,
        max_age=settings.session_ttl_days * 86400,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )


async def create_session(db, user: User, request: Request, settings) -> str:
    token = new_token()
    db.add(
        Session(
            token_hash=hash_token(token),
            user_id=user.id,
            expires_at=utcnow() + timedelta(days=settings.session_ttl_days),
            user_agent=(request.headers.get("user-agent") or "")[:255],
        )
    )
    await db.commit()
    return token


@router.post("/sign-up", response_model=UserOut, status_code=201)
async def sign_up(
    body: SignUpRequest, request: Request, response: Response, db: DbDep, settings: SettingsDep
):
    user_count = (await db.execute(select(func.count(User.id)))).scalar_one()
    if user_count > 0 and not settings.allow_signup:
        raise ForbiddenError(
            "Sign-up is disabled on this server. Ask the administrator for an account."
        )
    email = body.email.lower()
    existing = (
        await db.execute(
            select(User).where((User.email == email) | (User.username == body.username))
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise ConflictError("That email or username is already taken")
    user = User(
        email=email,
        username=body.username,
        password_hash=hash_password(body.password),
        display_name=body.display_name.strip() or body.username,
        is_admin=user_count == 0,
    )
    db.add(user)
    await db.flush()
    if body.create_example_ledger:
        ledger = Ledger(
            owner_id=user.id,
            slug="example",
            title="Example ledger",
            description="A sample ledger to explore the app.",
        )
        db.add(ledger)
        await db.flush()
        await get_store().create(
            ledger.id,
            template="example",
            title="Example ledger",
            currency="USD",
            author=author_for(user),
        )
    await db.commit()
    log.info("user %s signed up (admin=%s)", user.username, user.is_admin)
    token = await create_session(db, user, request, settings)
    _set_session_cookie(response, token, settings)
    return UserOut.model_validate(user)


@router.post("/login", response_model=UserOut)
async def login(
    body: LoginRequest, request: Request, response: Response, db: DbDep, settings: SettingsDep
):
    identifier = body.identifier.strip().lower()
    user = (
        await db.execute(
            select(User).where((User.email == identifier) | (User.username == identifier))
        )
    ).scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise UnauthorizedError("Incorrect email/username or password")
    token = await create_session(db, user, request, settings)
    _set_session_cookie(response, token, settings)
    return UserOut.model_validate(user)


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response, db: DbDep, settings: SettingsDep):
    cookie = request.cookies.get(settings.cookie_name)
    if cookie:
        row = await db.get(Session, hash_token(cookie))
        if row is not None:
            await db.delete(row)
            await db.commit()
    response.delete_cookie(settings.cookie_name, path="/")
    return Response(status_code=204)


@router.get("/me", response_model=UserOut)
async def me(auth: AuthDep):
    if auth.user is None:
        raise UnauthorizedError("Not signed in")
    return UserOut.model_validate(auth.user)


@router.post("/change-password", status_code=204)
async def change_password(body: ChangePasswordRequest, user: SessionUserDep, db: DbDep):
    if not verify_password(body.current_password, user.password_hash):
        raise UnauthorizedError("Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    await db.commit()
    return Response(status_code=204)


@router.post("/forgot-password", status_code=202)
async def forgot_password(body: ForgotPasswordRequest, db: DbDep, settings: SettingsDep):
    if not settings.email_enabled:
        raise FeatureDisabledError(
            "Password reset by email is not configured. Ask your administrator to reset your password."
        )
    user = (
        await db.execute(select(User).where(User.email == body.email.lower()))
    ).scalar_one_or_none()
    if user is not None:
        token = new_token()
        db.add(
            PasswordResetToken(
                token_hash=hash_token(token),
                user_id=user.id,
                expires_at=utcnow() + timedelta(hours=2),
            )
        )
        await db.commit()
        link = f"{settings.public_url.rstrip('/')}/reset-password?token={token}"
        await send_email(
            settings,
            user.email,
            f"Reset your {settings.app_name} password",
            f"Hi {user.display_name or user.username},\n\nReset your password here (valid for 2 hours):\n{link}\n\n"
            "If you did not request this, you can ignore this email.\n",
        )
    return {"accepted": True}


@router.post("/reset-password", status_code=204)
async def reset_password(body: ResetPasswordRequest, db: DbDep):
    row = await db.get(PasswordResetToken, hash_token(body.token))
    if (
        row is None
        or row.used_at is not None
        or row.expires_at.replace(tzinfo=row.expires_at.tzinfo or utcnow().tzinfo) < utcnow()
    ):
        raise ValidationError("This reset link is invalid or has expired")
    user = await db.get(User, row.user_id)
    if user is None:
        raise ValidationError("This reset link is invalid")
    user.password_hash = hash_password(body.password)
    row.used_at = utcnow()
    await db.commit()
    return Response(status_code=204)
