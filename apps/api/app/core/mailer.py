"""Minimal SMTP mailer for password-reset links. Disabled unless BS_SMTP_HOST is set."""

from __future__ import annotations

import asyncio
import smtplib
from email.message import EmailMessage

from app.config import Settings
from app.errors import FeatureDisabledError
from app.logging_setup import get_logger

log = get_logger(__name__)


def _send_sync(settings: Settings, to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as client:
        if settings.smtp_starttls:
            client.starttls()
        if settings.smtp_user:
            client.login(settings.smtp_user, settings.smtp_password)
        client.send_message(msg)


async def send_email(settings: Settings, to: str, subject: str, body: str) -> None:
    if not settings.email_enabled:
        raise FeatureDisabledError("Email is not configured on this server")
    try:
        await asyncio.to_thread(_send_sync, settings, to, subject, body)
    except (smtplib.SMTPException, OSError) as exc:
        log.error("sending email to %s failed: %s", to, exc, exc_info=exc)
        raise FeatureDisabledError("The mail server rejected the message") from exc
