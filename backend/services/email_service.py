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
    company: str,
    match_score: float,
    strengths: list = [],
    gaps: list = [],
    recruiter_name: str = "Recruitment Team",
    recruiter_email: str = "",
    recruiter_position: str = "Recruiter",
) -> None:
    signature = _build_signature(recruiter_name, recruiter_email, recruiter_position)
    strengths_section = _bullet_section("Your Strengths:", strengths[:3])
    gaps_section = _bullet_section("Areas to Strengthen:", gaps[:3])

    body = f"""Dear {candidate_name},

Thank you for applying for the {job_title} position at {company}.

After reviewing your profile (Match Score: {match_score:.1f}%), we are unable to move forward with your application at this time.
{strengths_section}{gaps_section}
We wish you the best in your job search.

Best regards,
{signature}"""

    await send_email(
        candidate_email,
        f"Update on Your Application — {job_title}",
        body,
    )


_STATUS_LABELS = {
    "pool_accepted":        "Shortlisted",
    "under_review":         "Under Review",
    "interview_scheduled":  "Interview Stage",
    "offer_extended":       "Offer Extended",
    "rejected":             "Not Moving Forward",
    "interview_rejected":   "Interview Not Passed",
}

_STATUS_MESSAGES = {
    "pool_accepted":        "Great news! Your application has been shortlisted. A recruiter will be reviewing your profile shortly.",
    "under_review":         "Your profile is currently being reviewed by our recruitment team.",
    "interview_scheduled":  "You have been selected for the interview stage. Our team will reach out with the details.",
    "offer_extended":       "We are delighted to extend an offer for this position! Please check your email for the offer details.",
    "rejected":             "Thank you for your interest. After careful consideration, we will not be moving forward with your application at this time.",
    "interview_rejected":   "Thank you for going through our interview process. Unfortunately, we have decided not to move forward after the interview stage.",
}


async def send_status_change_email(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    company: str,
    new_status: str,
    status_url: str,
    recruiter_name: str = "Recruitment Team",
    recruiter_email: str = "",
    recruiter_position: str = "Recruiter",
    feedback: str = "",
) -> None:
    label = _STATUS_LABELS.get(new_status, new_status.replace("_", " ").title())
    message = _STATUS_MESSAGES.get(new_status, "Your application status has been updated.")
    signature = _build_signature(recruiter_name, recruiter_email, recruiter_position)

    feedback_section = ""
    if new_status == "interview_rejected" and feedback:
        feedback_section = f"\nFeedback from the recruiter:\n{feedback}\n"

    body = f"""Dear {candidate_name},

Your application status for {job_title} at {company} has been updated.

Status: {label}

{message}
{feedback_section}
Track your application at any time:
{status_url}

Best regards,
{signature}"""

    await send_email(
        candidate_email,
        f"Application Update — {job_title} ({label})",
        body,
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
    strengths_section = _bullet_section("Your Strengths:", strengths[:3])
    gaps_section = _bullet_section("Areas to Strengthen:", gaps[:3])

    rank1_section = (
        f"\nWhat rank #1 has over you:\n{rank_explanation}\n"
        if rank > 1 and rank_explanation else ""
    )

    body = f"""Dear {candidate_name},

Your application for {job_title} has been shortlisted!

AI Match Score: {match_score:.1f}%
Your Rank: #{rank}
{strengths_section}{gaps_section}{rank1_section}
A recruiter will be in touch shortly with next steps.

Best regards,
{signature}"""

    await send_email(
        candidate_email,
        f"Application Shortlisted — {job_title}",
        body,
    )
