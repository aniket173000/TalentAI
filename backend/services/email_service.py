import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config import settings

logger = logging.getLogger(__name__)

# Values that mean "not actually configured"
_PLACEHOLDERS = {"", "your-email@gmail.com", "your-app-password", "your-password",
                 "your-godaddy-mailbox-password"}


def _smtp_ready() -> bool:
    return (
        settings.SMTP_USER not in _PLACEHOLDERS
        and settings.SMTP_PASSWORD not in _PLACEHOLDERS
    )


async def send_email(
    to_email: str,
    subject: str,
    body: str,
    html_body: str | None = None,
) -> None:
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
                    "Business mail is GoDaddy Professional Email (smtpout.secureserver.net, "
                    "STARTTLS on 587) — SMTP_USER must be the talent@nideknil.in mailbox "
                    "and SMTP_PASSWORD its GoDaddy mailbox password.")
        return

    try:
        import aiosmtplib

        # multipart/alternative when an HTML part is supplied, so clients that
        # render HTML show the branded version and the rest fall back to plain text.
        msg = MIMEMultipart("alternative" if html_body else "mixed")
        msg["Subject"] = subject
        msg["From"] = settings.FROM_EMAIL or settings.SMTP_USER
        msg["To"] = to_email
        msg.attach(MIMEText(body, "plain"))
        if html_body:
            msg.attach(MIMEText(html_body, "html"))

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
            "  1. GoDaddy: confirm the talent@nideknil.in mailbox exists and SMTP_PASSWORD is its\n"
            "     mailbox password (host smtpout.secureserver.net, STARTTLS on port 587)\n"
            "  2. SMTP_USER must match FROM_EMAIL so the mailbox may send as that address\n"
            "  3. For port 465 SSL change start_tls=True to use_tls=True in email_service.py"
        )


def _bullet_section(title: str, items: list) -> str:
    if not items:
        return ""
    bullets = "\n".join(f"  • {item}" for item in items)
    return f"\n{title}\n{bullets}\n"


_PLATFORM_FOOTER = (
    "\n──────────────────────────────────────────\n"
    "This email was sent via Nideknil AI — an AI-powered recruitment platform.\n"
    "nideknil.in  ·  Do not reply to this email directly.\n"
    "──────────────────────────────────────────"
)

_REFERRAL_TEAM_FOOTER = (
    "Nideknil Referral Team\n"
    "nideknil.in"
    + _PLATFORM_FOOTER
)

_TEAM_FOOTER = (
    "The Nideknil Team\n"
    "nideknil.in"
    + _PLATFORM_FOOTER
)


def _build_signature(
    recruiter_name: str,
    recruiter_email: str,
    recruiter_position: str,
) -> str:
    lines = [recruiter_name, recruiter_position]
    if recruiter_email:
        lines.append(f"📧 {recruiter_email}")
    lines.append("Nideknil Recruitment Team")
    return "\n".join(lines) + _PLATFORM_FOOTER


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
    "pool_accepted":        "Shortlisted for the Pool",
    "under_review":         "Under Review",
    "interview_scheduled":  "Interview Stage",
    "offer_extended":       "Offer Extended",
    "rejected":             "Not Moving Forward",
    "interview_rejected":   "Interview Not Passed",
}

_STATUS_MESSAGES = {
    "pool_accepted":        "Great news! Your application has been shortlisted for the pool. You will be notified if your rank changes — top-ranked candidates have the best shot when the recruiter reviews.",
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


# ── Referral email templates ──────────────────────────────────────────────────

async def send_referral_pool_accepted_email(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    company_name: str,
    referrer_name: str,
    referrer_title: str,
    rank: int,
    pool_size: int,
    match_score: float,
) -> None:
    body = f"""Dear {candidate_name},

Great news! You've been accepted into the referral pool for {job_title} at {company_name}.

Referral by: {referrer_name} ({referrer_title})
Your Position: #{rank} of {pool_size} pool spots
AI Match Score: {match_score:.1f}%

You are now in the active referral pool. The referrer will review the top candidates when the pool closes and submit referrals accordingly.

Keep an eye on your email — you'll be notified if your rank changes or if you've been selected for referral.

Best regards,
{_REFERRAL_TEAM_FOOTER}"""
    await send_email(candidate_email, f"You're in the Referral Pool — {job_title} at {company_name}", body)


async def send_referral_waitlist_accepted_email(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    company_name: str,
    referrer_name: str,
    referrer_title: str,
    waitlist_rank: int,
    match_score: float,
) -> None:
    body = f"""Dear {candidate_name},

You've been placed on the referral waitlist for {job_title} at {company_name}.

Referral by: {referrer_name} ({referrer_title})
Waitlist Position: #{waitlist_rank}
AI Match Score: {match_score:.1f}%

Important — please read carefully:
You are currently on the waitlist, not in the main referral pool. This means:

  • You will only be considered for referral after ALL main pool candidates have been referred.
  • A referral from the waitlist depends entirely on whether the referrer has remaining capacity and time after referring the pool candidates.
  • The chance of receiving a referral from the waitlist is limited.

We will notify you if your waitlist position changes or if the pool closes.

Best regards,
{_REFERRAL_TEAM_FOOTER}"""
    await send_email(candidate_email, f"Waitlisted for Referral — {job_title} at {company_name}", body)


async def send_referral_pool_rejection_email(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    company_name: str,
    referrer_name: str,
    match_score: float,
    reason: str = "low_score",  # "low_score" | "pool_full" | "locked"
) -> None:
    reason_text = {
        "low_score": f"Your profile score ({match_score:.1f}%) did not meet the minimum qualification threshold for this referral.",
        "pool_full": f"Both the referral pool and waitlist are full, and your score ({match_score:.1f}%) was not high enough to displace a current member.",
        "locked": "You are currently active in another referral pool at this company. You can apply to other referral posts once your current pool closes.",
    }.get(reason, "You did not qualify for this referral at this time.")

    body = f"""Dear {candidate_name},

Thank you for your interest in the referral for {job_title} at {company_name} (via {referrer_name}).

Unfortunately, we were unable to place you in the referral pool at this time.

Reason: {reason_text}

You are welcome to explore other referral opportunities at different companies or apply directly to job postings.

Best regards,
{_REFERRAL_TEAM_FOOTER}"""
    await send_email(candidate_email, f"Referral Application Update — {job_title} at {company_name}", body)


async def send_referral_displacement_email(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    company_name: str,
    referrer_name: str,
    pool_type: str,
    match_score: float,
) -> None:
    pool_label = "referral pool" if pool_type == "pool" else "waitlist"
    body = f"""Dear {candidate_name},

Your application for the referral to {job_title} at {company_name} (via {referrer_name}) has been displaced from the {pool_label}.

A stronger candidate has entered, and as the lowest-ranked member at that time (your score: {match_score:.1f}%), your spot was displaced.

This is not a reflection of weak qualifications — you were shortlisted, which means you cleared the initial threshold. The {pool_label} simply filled with stronger matches.

You are welcome to apply to other referral opportunities on Nideknil.

Best regards,
{_REFERRAL_TEAM_FOOTER}"""
    await send_email(candidate_email, f"Displaced from Referral {pool_label.title()} — {job_title} at {company_name}", body)


async def send_referral_rank_change_email(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    company_name: str,
    old_rank: int,
    new_rank: int,
    pool_type: str,
) -> None:
    pool_label = "referral pool" if pool_type == "pool" else "waitlist"
    moved = old_rank - new_rank
    direction = f"improved — you moved up from #{old_rank} to #{new_rank}" if moved > 0 else f"updated from #{old_rank} to #{new_rank} as a new stronger candidate joined"
    body = f"""Dear {candidate_name},

Your position in the {pool_label} for {job_title} at {company_name} has {direction}.

You remain active in the {pool_label}. We'll notify you when the pool closes or your status changes.

Best regards,
{_REFERRAL_TEAM_FOOTER}"""
    await send_email(candidate_email, f"Referral Rank {'Improved' if moved > 0 else 'Updated'} — {job_title} at {company_name}", body)


async def send_referral_referred_email(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    company_name: str,
    referrer_name: str,
    referrer_title: str,
) -> None:
    body = f"""Dear {candidate_name},

Congratulations! You have been officially referred for the {job_title} position at {company_name}.

Referred by: {referrer_name} ({referrer_title})

What this means:
  • {referrer_name} has submitted an internal referral on your behalf at {company_name}.
  • The hiring team at {company_name} will now review your profile with the referral context.
  • A direct referral significantly improves your visibility with the hiring team.

Please ensure your resume and profile are up to date. The company's recruitment team may reach out to you directly.

Best of luck!

Best regards,
{_REFERRAL_TEAM_FOOTER}"""
    await send_email(candidate_email, f"You've Been Referred! — {job_title} at {company_name}", body)


async def send_referral_pool_closed_not_referred_email(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    company_name: str,
    referrer_name: str,
    was_waitlist: bool,
) -> None:
    pool_label = "waitlist" if was_waitlist else "pool"
    body = f"""Dear {candidate_name},

The referral pool for {job_title} at {company_name} (via {referrer_name}) has now closed.

Unfortunately, you were not selected for referral from the {pool_label} this time.

{"As a waitlist member, referrals were prioritized for the main pool candidates and the referrer did not have remaining capacity to refer waitlist members." if was_waitlist else "The referrer has completed their referrals for this round."}

Don't be discouraged — you can continue exploring referral opportunities at other companies on Nideknil.

Best regards,
{_REFERRAL_TEAM_FOOTER}"""
    await send_email(candidate_email, f"Referral Pool Closed — {job_title} at {company_name}", body)


async def send_referral_pool_nearing_full_email(
    referrer_email: str,
    referrer_name: str,
    job_title: str,
    company_name: str,
    filled: int,
    pool_size: int,
    post_slug: str,
    frontend_url: str,
) -> None:
    remaining = pool_size - filled
    body = f"""Hi {referrer_name},

Your referral pool for {job_title} at {company_name} is filling up fast.

Pool Status: {filled} of {pool_size} spots filled ({remaining} remaining)

Log in to review candidates in your pool before it fills up:
{frontend_url}/referrals/{post_slug}/dashboard

Best regards,
{_REFERRAL_TEAM_FOOTER}"""
    await send_email(referrer_email, f"Your Referral Pool is {int((filled/pool_size)*100)}% Full — {job_title}", body)


async def send_referral_auto_closed_email(
    referrer_email: str,
    referrer_name: str,
    job_title: str,
    company_name: str,
    post_slug: str,
    frontend_url: str,
    pool_count: int,
) -> None:
    body = f"""Hi {referrer_name},

Your referral post for {job_title} at {company_name} has been automatically closed as the 5-day window has expired.

Pool Summary: {pool_count} candidate(s) in the referral pool

Next steps:
  1. Review your pool at: {frontend_url}/referrals/{post_slug}/dashboard
  2. Select candidates you want to refer and mark the post as "Referring"
  3. Once you've submitted referrals, mark it as "Referred All" to complete the process

Best regards,
{_REFERRAL_TEAM_FOOTER}"""
    await send_email(referrer_email, f"Referral Post Auto-Closed — {job_title} at {company_name}", body)


async def send_signup_otp_email(
    email: str,
    full_name: str,
    otp_code: str,
    expiry_minutes: int = 10,
) -> None:
    greeting = f"Hi {full_name.split()[0]}," if full_name else "Hi,"
    body = f"""{greeting}

Welcome to Nideknil! Please confirm your email address to finish creating your account.

Your verification code is:

    {otp_code}

This code expires in {expiry_minutes} minutes. Enter it on the signup screen to activate your account.

If you didn't try to sign up for Nideknil, you can safely ignore this email — no account will be created.

Best regards,
{_TEAM_FOOTER}"""
    await send_email(email, f"Verify your email — Nideknil ({otp_code})", body)


async def send_referral_otp_email(
    work_email: str,
    full_name: str,
    otp_code: str,
    company_name: str,
) -> None:
    body = f"""Hi {full_name},

Here is your verification code to confirm your work email for creating a referral post at {company_name}:

Verification Code: {otp_code}

This code expires in 15 minutes. Do not share it with anyone.

If you did not request this, please ignore this email.

Best regards,
{_REFERRAL_TEAM_FOOTER}"""
    await send_email(work_email, f"Work Email Verification — Nideknil Referrals ({otp_code})", body)


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

    rank_note = (
        f"You are currently ranked #{rank} in the pool. "
        "Stronger candidates can enter after you and may push your rank down — "
        "the top-ranked candidates have the best shot when the recruiter reviews the pool."
        if rank > 1
        else
        "You are currently ranked #1 in the pool — the strongest match so far. "
        "Stay ahead by keeping your profile and resume up to date."
    )

    body = f"""Dear {candidate_name},

Great news — your application for {job_title} has been shortlisted for the pool!

AI Match Score: {match_score:.1f}%
Your Rank: #{rank}
{strengths_section}{gaps_section}{rank1_section}
What this means:
You have cleared the minimum match threshold and earned a spot in the competitive candidate pool. The recruiter will review the top-ranked candidates when the pool closes.

{rank_note}

Keep an eye on your email — you will be notified if your rank changes or if a stronger candidate displaces your position.

Best regards,
{signature}"""

    await send_email(
        candidate_email,
        f"Application Shortlisted — {job_title}",
        body,
    )
