import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config import settings

logger = logging.getLogger(__name__)

# Values that mean "not actually configured"
_PLACEHOLDERS = {"", "your-email@gmail.com", "your-app-password", "your-password"}


def _smtp_ready() -> bool:
    return (
        settings.SMTP_USER not in _PLACEHOLDERS
        and settings.SMTP_PASSWORD not in _PLACEHOLDERS
    )


async def send_email(to_email: str, subject: str, body: str) -> None:
    if not _smtp_ready():
        # ── console fallback (dev / unconfigured) ────────────────────────────
        sep = "=" * 60
        print(f"\n{sep}")
        print(f"[EMAIL] To:      {to_email}")
        print(f"[EMAIL] Subject: {subject}")
        print(f"[EMAIL] Body:\n{body}")
        print(sep)
        logger.info("Email printed to console (SMTP not configured). "
                    "To enable real delivery, set SMTP_USER / SMTP_PASSWORD in .env. "
                    "For Gmail, create an App Password at "
                    "https://myaccount.google.com/apppasswords")
        return

    try:
        import aiosmtplib

        msg = MIMEMultipart()
        msg["Subject"] = subject
        msg["From"] = settings.FROM_EMAIL or settings.SMTP_USER
        msg["To"] = to_email
        msg.attach(MIMEText(body, "plain"))

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True,  # port 587 STARTTLS — use use_tls=True for port 465
        )
        logger.info(f"Email sent to {to_email}: {subject}")

    except Exception as exc:
        # Log full error so operators can diagnose without guessing
        logger.error(
            f"Failed to send email to {to_email}: {exc}\n"
            "Common fixes:\n"
            "  1. Gmail: create an App Password at https://myaccount.google.com/apppasswords\n"
            "  2. Set FROM_EMAIL=SMTP_USER in .env if FROM_EMAIL is blank\n"
            "  3. For port 465 SSL change start_tls=True to use_tls=True in email_service.py"
        )


def _bullet_section(title: str, items: list) -> str:
    if not items:
        return ""
    bullets = "\n".join(f"  • {item}" for item in items)
    return f"\n{title}\n{bullets}\n"


def _build_signature(
    recruiter_name: str,
    recruiter_email: str,
    recruiter_position: str,
) -> str:
    lines = [recruiter_name]
    if recruiter_email:
        lines.append(recruiter_email)
    lines.append(recruiter_position)
    lines.append("TalentAI Recruitment Team")
    return "\n".join(lines)


async def send_rejection_email(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    email_body: str,
    strengths: list = [],
    gaps: list = [],
) -> None:
    sections = (
        _bullet_section("Your Strengths:", strengths)
        + _bullet_section("Areas to Strengthen:", gaps)
    )
    full_body = email_body + ("\n" + sections.strip() if sections.strip() else "")
    await send_email(
        candidate_email,
        f"Update on Your Application — {job_title}",
        full_body,
    )


async def send_acceptance_notification(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    rank: int,
    match_score: float,
    recruiter_name: str = "Recruitment Team",
    recruiter_email: str = "",
    recruiter_position: str = "Recruiter",
    strengths: list = [],
    gaps: list = [],
    rank_explanation: str = "",
) -> None:
    signature = _build_signature(recruiter_name, recruiter_email, recruiter_position)

    strengths_section = _bullet_section("Your Strengths:", strengths)
    gaps_section = _bullet_section("Areas to Strengthen:", gaps)

    explanation_section = (
        f"\nWhy you're ranked #{rank}:\n{rank_explanation}\n"
        if rank_explanation else ""
    )

    body = f"""Dear {candidate_name},

Thank you for applying for the {job_title} position. We're pleased to let you know that your application has been shortlisted!

Your AI Match Score: {match_score:.1f}%
Current Rank in Pool: #{rank}
{strengths_section}{gaps_section}{explanation_section}
Your profile is now in our active candidate pool and a recruiter will be in touch shortly with next steps.

We appreciate your interest and look forward to learning more about you.

Best regards,
{signature}"""

    await send_email(
        candidate_email,
        f"Application Shortlisted — {job_title}",
        body,
    )
