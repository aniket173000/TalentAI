import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from config import settings

logger = logging.getLogger(__name__)


async def send_email(to_email: str, subject: str, body: str) -> None:
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        # Log to console when SMTP is not configured
        separator = "=" * 60
        print(f"\n{separator}")
        print(f"[EMAIL] To: {to_email}")
        print(f"[EMAIL] Subject: {subject}")
        print(f"[EMAIL] Body:\n{body}")
        print(separator)
        logger.info(f"Email (console-only) sent to {to_email}: {subject}")
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
            start_tls=True,
        )
        logger.info(f"Email sent to {to_email}: {subject}")
    except Exception as exc:
        logger.error(f"Failed to send email to {to_email}: {exc}")


async def send_rejection_email(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    email_body: str,
) -> None:
    subject = f"Update on Your Application — {job_title}"
    await send_email(candidate_email, subject, email_body)


async def send_acceptance_notification(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    rank: int,
    match_score: float,
) -> None:
    body = f"""Dear {candidate_name},

Thank you for applying for the {job_title} position. We're pleased to let you know that your application has been shortlisted!

Your AI Match Score: {match_score:.1f}%
Current Rank in Pool: #{rank}

Your profile is now in our active candidate pool and a recruiter will be in touch shortly with next steps.

We appreciate your interest and look forward to learning more about you.

Best regards,
The Recruitment Team"""

    subject = f"Application Shortlisted — {job_title}"
    await send_email(candidate_email, subject, body)
