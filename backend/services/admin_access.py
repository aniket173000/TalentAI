"""Admin access control — an env-based email allowlist (settings.ADMIN_EMAILS).

No DB migration / role column needed. Gmail aliases are normalised so a single
allowlisted address (e.g. you@gmail.com) also matches you+anything@gmail.com.
"""
from config import settings


def _normalize(email: str) -> str:
    email = (email or "").strip().lower()
    if "@" not in email:
        return email
    local, domain = email.split("@", 1)
    local = local.split("+", 1)[0]          # strip "+alias"
    if domain in ("gmail.com", "googlemail.com"):
        local = local.replace(".", "")      # gmail ignores dots
        domain = "gmail.com"
    return f"{local}@{domain}"


def admin_email_set() -> set[str]:
    return {_normalize(e) for e in settings.ADMIN_EMAILS.split(",") if e.strip()}


def is_admin_email(email: str) -> bool:
    allow = admin_email_set()
    return bool(allow) and _normalize(email) in allow
