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


async def send_displacement_email(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    company: str,
    displaced_score: float,
    status_url: str | None,
    comparison: dict | None,
    recruiter_name: str = "Recruitment Team",
    recruiter_email: str = "",
    recruiter_position: str = "Recruiter",
) -> None:
    signature = _build_signature(recruiter_name, recruiter_email, recruiter_position)

    comparison_section = ""
    if comparison:
        areas = comparison.get("comparison", [])
        rank1_strengths = comparison.get("rank1_key_strengths", [])
        encouragement = comparison.get("encouragement", "")

        if rank1_strengths:
            strengths_text = "\n".join(f"  • {s}" for s in rank1_strengths)
            comparison_section += f"\nWhat made the stronger candidate stand out:\n{strengths_text}\n"

        if areas:
            comparison_section += "\n─────────────────────────────────────\nDetailed Comparison & Improvement Areas\n─────────────────────────────────────\n"
            for item in areas:
                comparison_section += (
                    f"\n📌 {item.get('area', '')}\n"
                    f"  Top candidate: {item.get('rank1_has', '')}\n"
                    f"  Your profile:  {item.get('you_have', '')}\n"
                    f"  → Work on:     {item.get('improvement', '')}\n"
                )

        if encouragement:
            comparison_section += f"\n{encouragement}\n"

    status_section = (
        f"\nYou can still reapply with an updated resume before the position closes.\nTrack the job at: {status_url}\n"
        if status_url else ""
    )

    body = f"""Dear {candidate_name},

Your application for {job_title} at {company} was shortlisted, but has been displaced from the pool.

Why this happened:
A new candidate with a stronger profile entered the competition. As the lowest-ranked candidate in the pool at that time (your score: {displaced_score:.1f}%), your position was displaced to make room.

This does not mean your profile is weak — you were shortlisted, which means you cleared the initial threshold. The pool simply filled with stronger matches.
{comparison_section}{status_section}
Best regards,
{signature}"""

    await send_email(
        candidate_email,
        f"Application Update — {job_title} (Displaced from Pool)",
        body,
    )


async def send_rank_change_email(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    company: str,
    old_rank: int,
    new_rank: int,
    status_url: str,
    recruiter_name: str = "Recruitment Team",
    recruiter_email: str = "",
    recruiter_position: str = "Recruiter",
) -> None:
    signature = _build_signature(recruiter_name, recruiter_email, recruiter_position)
    moved = old_rank - new_rank  # positive = moved up, negative = moved down

    if moved > 0:
        direction_line = f"Your ranking has improved — you moved up from #{old_rank} to #{new_rank}."
        subject_tag = "Rank Improved"
    else:
        direction_line = f"A strong new candidate joined the pool — your rank moved from #{old_rank} to #{new_rank}."
        subject_tag = "Rank Updated"

    body = f"""Dear {candidate_name},

We have an update on your application for {job_title} at {company}.

{direction_line}

You remain in the shortlisted pool and your application is still active.

Track your current standing at any time:
{status_url}

Best regards,
{signature}"""

    await send_email(
        candidate_email,
        f"Application Update — {job_title} ({subject_tag})",
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
