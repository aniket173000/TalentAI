"""
Send email AS the candidate through the Gmail API (OAuth 2.0 offline grant,
scope gmail.send). The message goes out from the candidate's own Gmail account:
From: is their address, it's DKIM-signed by Google as them, it lands in their
Sent folder, and replies come back to them. Nideknil never appears.

Refresh tokens are Fernet-encrypted at rest (TOKEN_ENCRYPTION_KEY; dev falls
back to a key derived from JWT_SECRET). A revoked grant raises GmailAuthError
so the router can flag the credential and the UI can prompt a reconnect.
"""
import base64
import hashlib
import logging
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email import encoders

import httpx
from cryptography.fernet import Fernet, InvalidToken

from config import settings

logger = logging.getLogger(__name__)

TOKEN_URL = "https://oauth2.googleapis.com/token"
_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
_REVOKE_URL = "https://oauth2.googleapis.com/revoke"

GMAIL_SCOPES = "openid email https://www.googleapis.com/auth/gmail.send"


class GmailError(Exception):
    """Transient/config send failure — safe to retry after fixing."""


class GmailAuthError(GmailError):
    """The grant is gone (user revoked access / token expired-invalid).
    The stored credential is dead; the user must reconnect Gmail."""


# ── Token encryption ───────────────────────────────────────────────────────────

def _fernet() -> Fernet:
    key = settings.TOKEN_ENCRYPTION_KEY
    if not key:
        # Dev fallback — stable key derived from JWT_SECRET. Set TOKEN_ENCRYPTION_KEY
        # in prod so rotating JWT_SECRET doesn't orphan every stored credential.
        digest = hashlib.sha256(settings.JWT_SECRET.encode()).digest()
        key = base64.urlsafe_b64encode(digest).decode()
    return Fernet(key)


def encrypt_token(raw: str) -> str:
    return _fernet().encrypt(raw.encode()).decode()


def decrypt_token(encrypted: str) -> str:
    try:
        return _fernet().decrypt(encrypted.encode()).decode()
    except InvalidToken:
        raise GmailAuthError(
            "Stored Gmail credential can't be decrypted (encryption key changed?) — reconnect Gmail."
        )


# ── OAuth plumbing ─────────────────────────────────────────────────────────────

async def _access_token(refresh_token: str) -> str:
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if r.status_code != 200:
        err = ""
        try:
            err = r.json().get("error", "")
        except Exception:  # noqa: BLE001
            pass
        if err in ("invalid_grant", "unauthorized_client"):
            raise GmailAuthError("Gmail access was revoked or expired — reconnect your Gmail.")
        raise GmailError(f"Gmail token refresh failed ({r.status_code}): {r.text[:200]}")
    return r.json()["access_token"]


async def revoke_grant(refresh_token_encrypted: str) -> None:
    """Best-effort revoke at Google (called on user-initiated disconnect)."""
    try:
        token = decrypt_token(refresh_token_encrypted)
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(_REVOKE_URL, params={"token": token})
    except Exception as exc:  # noqa: BLE001 — disconnect must never fail on this
        logger.warning("Gmail revoke call failed (credential is deleted locally anyway): %s", exc)


# ── Send ───────────────────────────────────────────────────────────────────────

async def send_as_user(
    refresh_token_encrypted: str,
    *,
    to_email: str,
    subject: str,
    body_text: str,
    attachment: tuple[str, bytes] | None = None,
) -> str:
    """Send a plain-text email (optionally with one attachment) as the connected
    Gmail account. Returns the Gmail message id.

    From: is deliberately not set — Gmail stamps the authenticated account, so a
    forged header can never make mail appear from someone else.
    """
    access_token = await _access_token(decrypt_token(refresh_token_encrypted))

    if attachment:
        filename, content = attachment
        msg = MIMEMultipart("mixed")
        msg.attach(MIMEText(body_text, "plain"))
        part = MIMEBase("application", "octet-stream")
        part.set_payload(content)
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
        msg.attach(part)
    else:
        msg = MIMEText(body_text, "plain")
    msg["To"] = to_email
    msg["Subject"] = subject

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            _SEND_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            json={"raw": raw},
        )
    if r.status_code == 401:
        raise GmailAuthError("Gmail rejected the credential — reconnect your Gmail.")
    if r.status_code == 403:
        raise GmailError(
            "Gmail refused the send (rate limit or missing gmail.send scope): " + r.text[:200]
        )
    if r.status_code != 200:
        raise GmailError(f"Gmail send failed ({r.status_code}): {r.text[:300]}")

    message_id = r.json().get("id", "")
    logger.info("Cold email sent via Gmail API (message id %s)", message_id)
    return message_id
