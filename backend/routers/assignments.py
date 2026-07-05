"""
AI Fluency Assignments API.

Recruiter side (JWT + recruiter mode):
    POST   /api/assignments                          create under a job
    GET    /api/assignments?job_id=                  list for a job
    GET    /api/assignments/{id}                     detail
    PATCH  /api/assignments/{id}                     edit / close
    POST   /api/assignments/{id}/invite              invite applicants / emails
    GET    /api/assignments/{id}/submissions         submission list + scores
    GET    /api/assignments/submissions/{sid}/report full fluency report
    POST   /api/assignments/submissions/{sid}/retry  re-run failed analysis

Candidate side (tokenized, no login — mirrors Application.status_token):
    GET    /api/assignments/portal/{token}           assignment brief + status
    POST   /api/assignments/portal/{token}/submit    upload transcript files
"""
from __future__ import annotations

import asyncio
import json
import logging
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from config import settings
from database import get_db
from routers.auth import require_recruiter
from services.email_service import send_email
from services.fluency import store
from services.fluency.pipeline import dispatch_fluency_analysis
from services.fluency.scrubber import scrub_transcript_bytes
from services.fluency.transcript_parser import TranscriptParseError, parse_claude_code_jsonl

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/assignments", tags=["assignments"])


# ── helpers ───────────────────────────────────────────────────────────────────

def _own_assignment(db: Session, assignment_id: int, recruiter: models.User) -> models.Assignment:
    # Eager-load job: _send_invite_email reads assignment.job.* from inside a
    # BackgroundTask, which runs after get_db() has already closed this
    # session — a lazy load at that point raises DetachedInstanceError.
    assignment = db.get(models.Assignment, assignment_id, options=[joinedload(models.Assignment.job)])
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if assignment.recruiter_id != recruiter.id:
        raise HTTPException(status_code=403, detail="Not your assignment")
    return assignment


def _own_submission(db: Session, submission_id: int, recruiter: models.User) -> models.AssignmentSubmission:
    submission = db.get(models.AssignmentSubmission, submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    if submission.assignment.recruiter_id != recruiter.id:
        raise HTTPException(status_code=403, detail="Not your submission")
    return submission


def _submission_response(s: models.AssignmentSubmission) -> schemas.SubmissionResponse:
    resp = schemas.SubmissionResponse.model_validate(s)
    if s.report:
        resp.overall_score = s.report.overall_score
        resp.integrity_confidence = s.report.integrity_confidence
    return resp


def _assignment_open(a: models.Assignment) -> bool:
    if a.status != "active":
        return False
    if a.deadline:
        deadline = a.deadline if a.deadline.tzinfo else a.deadline.replace(tzinfo=timezone.utc)
        if deadline < datetime.now(timezone.utc):
            return False
    return True


async def _send_invite_email(to_email: str, candidate_name: str, assignment_title: str,
                             job_title: str, job_company: str,
                             deadline_at: datetime | None, token: str) -> None:
    # Takes plain values, not the Assignment ORM object: this runs as a
    # BackgroundTask after get_db() has already closed the request's session,
    # and db.commit() earlier in the request expires every loaded attribute
    # (even eager-loaded ones) — any ORM attribute access here would raise
    # DetachedInstanceError.
    link = f"{settings.FRONTEND_URL}/assignment/{token}"
    mcp_command = (
        f'claude mcp add --transport http nideknil-assignment {settings.MCP_PUBLIC_URL}/mcp '
        f'--header "Authorization: Bearer {token}"'
    )
    deadline = (
        f"\nDeadline: {deadline_at.strftime('%d %b %Y, %H:%M UTC')}"
        if deadline_at else ""
    )
    body = (
        f"Hi {candidate_name},\n\n"
        f"You've been invited to complete a take-home assignment for "
        f"{job_title} at {job_company}.\n\n"
        f"\"{assignment_title}\"{deadline}\n\n"
        f"This assignment must be built using Claude Code, and you'll submit your "
        f"Claude Code session transcripts along with your work — we assess how "
        f"effectively you collaborate with AI, not just the final code.\n\n"
        f"Open your assignment portal to see the full brief and submit:\n{link}\n\n"
        f"Or connect this same link straight into your terminal — run this once and you "
        f"can ask Claude Code for the brief or how to submit at any time:\n{mcp_command}\n\n"
        f"Good luck!\n{job_company} Recruiting"
    )
    try:
        await send_email(to_email, f"Take-home assignment: {job_title}", body)
    except Exception as exc:
        logger.warning("Invite email to %s failed: %s", to_email, exc)


# ── recruiter: assignments CRUD ───────────────────────────────────────────────

@router.post("", response_model=schemas.AssignmentResponse, status_code=201)
def create_assignment(
    payload: schemas.AssignmentCreate,
    db: Session = Depends(get_db),
    recruiter: models.User = Depends(require_recruiter),
):
    job = db.get(models.Job, payload.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.recruiter_id != recruiter.id:
        raise HTTPException(status_code=403, detail="Not your job")

    assignment = models.Assignment(
        job_id=job.id,
        recruiter_id=recruiter.id,
        title=payload.title,
        brief=payload.brief,
        evaluation_focus=payload.evaluation_focus,
        deadline=payload.deadline,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return schemas.AssignmentResponse.model_validate(assignment)


@router.get("", response_model=list[schemas.AssignmentResponse])
def list_assignments(
    job_id: int = Query(...),
    db: Session = Depends(get_db),
    recruiter: models.User = Depends(require_recruiter),
):
    job = db.get(models.Job, job_id)
    if not job or job.recruiter_id != recruiter.id:
        raise HTTPException(status_code=404, detail="Job not found")

    assignments = (
        db.query(models.Assignment)
        .filter(models.Assignment.job_id == job_id)
        .order_by(models.Assignment.created_at.desc())
        .all()
    )
    out = []
    for a in assignments:
        resp = schemas.AssignmentResponse.model_validate(a)
        counts: dict[str, int] = {}
        for s in a.submissions:
            counts[s.status] = counts.get(s.status, 0) + 1
        resp.submission_counts = counts
        out.append(resp)
    return out


@router.get("/{assignment_id}", response_model=schemas.AssignmentResponse)
def get_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    recruiter: models.User = Depends(require_recruiter),
):
    assignment = _own_assignment(db, assignment_id, recruiter)
    resp = schemas.AssignmentResponse.model_validate(assignment)
    counts: dict[str, int] = {}
    for s in assignment.submissions:
        counts[s.status] = counts.get(s.status, 0) + 1
    resp.submission_counts = counts
    return resp


@router.patch("/{assignment_id}", response_model=schemas.AssignmentResponse)
def update_assignment(
    assignment_id: int,
    payload: schemas.AssignmentUpdate,
    db: Session = Depends(get_db),
    recruiter: models.User = Depends(require_recruiter),
):
    assignment = _own_assignment(db, assignment_id, recruiter)
    for field in ("title", "brief", "evaluation_focus", "deadline", "status"):
        value = getattr(payload, field)
        if value is not None:
            setattr(assignment, field, value)
    db.commit()
    db.refresh(assignment)
    return schemas.AssignmentResponse.model_validate(assignment)


# ── recruiter: invitations ────────────────────────────────────────────────────

@router.post("/{assignment_id}/invite", response_model=list[schemas.SubmissionResponse])
async def invite_candidates(
    assignment_id: int,
    payload: schemas.InviteRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    recruiter: models.User = Depends(require_recruiter),
):
    assignment = _own_assignment(db, assignment_id, recruiter)
    if not _assignment_open(assignment):
        raise HTTPException(status_code=400, detail="Assignment is closed")

    invitees: list[tuple[str, str, int | None]] = []  # (name, email, application_id)

    for app_id in payload.application_ids:
        app = db.get(models.Application, app_id)
        if not app or app.job_id != assignment.job_id:
            raise HTTPException(status_code=400,
                                detail=f"Application {app_id} does not belong to this job")
        invitees.append((app.candidate_name, app.candidate_email, app.id))

    for email in payload.emails:
        invitees.append((email.split("@")[0], str(email), None))

    if not invitees:
        raise HTTPException(status_code=400, detail="No candidates to invite")

    existing_emails = {
        s.candidate_email.lower()
        for s in db.query(models.AssignmentSubmission)
        .filter(models.AssignmentSubmission.assignment_id == assignment.id)
        .all()
    }

    created: list[models.AssignmentSubmission] = []
    for name, email, app_id in invitees:
        if email.lower() in existing_emails:
            continue                                   # idempotent re-invite
        existing_emails.add(email.lower())
        submission = models.AssignmentSubmission(
            assignment_id=assignment.id,
            application_id=app_id,
            candidate_name=name,
            candidate_email=email,
            access_token=secrets.token_urlsafe(32),
        )
        db.add(submission)
        created.append(submission)

    # Read before commit — expire_on_commit invalidates these afterward, and
    # the background task runs post-response with the session already closed.
    assignment_title, job_title, job_company, deadline_at = (
        assignment.title, assignment.job.title, assignment.job.company, assignment.deadline
    )

    db.commit()
    for s in created:
        db.refresh(s)
        background.add_task(_send_invite_email, s.candidate_email, s.candidate_name,
                            assignment_title, job_title, job_company, deadline_at, s.access_token)

    return [_submission_response(s) for s in created]


@router.get("/{assignment_id}/submissions", response_model=list[schemas.SubmissionResponse])
def list_submissions(
    assignment_id: int,
    db: Session = Depends(get_db),
    recruiter: models.User = Depends(require_recruiter),
):
    assignment = _own_assignment(db, assignment_id, recruiter)
    subs = sorted(assignment.submissions, key=lambda s: s.invited_at or datetime.min,
                  reverse=True)
    return [_submission_response(s) for s in subs]


# ── recruiter: report + retry ─────────────────────────────────────────────────

@router.get("/submissions/{submission_id}/report", response_model=schemas.FluencyReportResponse)
def get_report(
    submission_id: int,
    db: Session = Depends(get_db),
    recruiter: models.User = Depends(require_recruiter),
):
    submission = _own_submission(db, submission_id, recruiter)
    report = submission.report
    if not report:
        raise HTTPException(status_code=404,
                            detail=f"No report yet (submission is {submission.status})")

    def _loads(value, default):
        try:
            return json.loads(value) if value else default
        except (TypeError, ValueError):
            return default

    return schemas.FluencyReportResponse(
        submission_id=submission.id,
        candidate_name=submission.candidate_name,
        overall_score=report.overall_score,
        summary=report.summary or "",
        dimensions=_loads(report.dimensions, []),
        highlights=_loads(report.highlights, {}),
        metrics=_loads(report.metrics, {}),
        integrity_flags=_loads(report.integrity_flags, []),
        integrity_confidence=report.integrity_confidence,
        provider=report.provider,
        chunk_model=report.chunk_model,
        aggregate_model=report.aggregate_model,
        created_at=report.created_at,
    )


@router.post("/submissions/{submission_id}/retry", response_model=schemas.SubmissionResponse)
def retry_analysis(
    submission_id: int,
    db: Session = Depends(get_db),
    recruiter: models.User = Depends(require_recruiter),
):
    submission = _own_submission(db, submission_id, recruiter)
    if submission.status not in ("failed", "submitted"):
        raise HTTPException(status_code=400,
                            detail=f"Cannot retry a submission in status {submission.status!r}")
    dispatch_fluency_analysis(submission.id)
    return _submission_response(submission)


# ── candidate portal (tokenized, no auth) ─────────────────────────────────────

def _by_token(db: Session, token: str) -> models.AssignmentSubmission:
    submission = (
        db.query(models.AssignmentSubmission)
        .filter(models.AssignmentSubmission.access_token == token)
        .first()
    )
    if not submission:
        raise HTTPException(status_code=404, detail="Invalid assignment link")
    return submission


@router.get("/portal/{token}", response_model=schemas.CandidateAssignmentView)
def candidate_view(token: str, db: Session = Depends(get_db)):
    submission = _by_token(db, token)
    assignment = submission.assignment
    # Candidate sees pipeline states as a simple "submitted" — reports are
    # recruiter-only in v1.
    status = submission.status
    if status in ("processing", "analyzed", "failed"):
        status = "submitted"
    return schemas.CandidateAssignmentView(
        assignment_title=assignment.title,
        brief=assignment.brief,
        deadline=assignment.deadline,
        required_tool=assignment.required_tool,
        company=assignment.job.company,
        job_title=assignment.job.title,
        candidate_name=submission.candidate_name,
        status=status,
        submitted_at=submission.submitted_at,
        assignment_open=_assignment_open(assignment),
    )


@router.post("/portal/{token}/submit", response_model=schemas.CandidateAssignmentView)
async def candidate_submit(
    token: str,
    files: list[UploadFile] = File(...),
    repo_url: str | None = Form(None),
    consent: bool = Form(...),
    git_metadata: str | None = Form(None),   # JSON string, set by the submit CLI
    submit_source: str = Form("web"),        # "web" | "cli"
    db: Session = Depends(get_db),
):
    submission = _by_token(db, token)
    assignment = submission.assignment

    if not consent:
        raise HTTPException(status_code=400,
                            detail="You must consent to transcript analysis to submit")
    if not _assignment_open(assignment):
        raise HTTPException(status_code=400, detail="This assignment is closed")
    if submission.status not in ("invited", "failed"):
        raise HTTPException(status_code=400, detail="Already submitted")
    if not files:
        raise HTTPException(status_code=400, detail="Upload at least one .jsonl transcript file")
    if len(files) > settings.FLUENCY_MAX_FILES:
        raise HTTPException(status_code=400,
                            detail=f"Too many files (max {settings.FLUENCY_MAX_FILES})")

    max_file = settings.FLUENCY_MAX_FILE_MB * 1024 * 1024
    max_total = settings.FLUENCY_MAX_TOTAL_MB * 1024 * 1024
    total = 0
    loop = asyncio.get_event_loop()

    stored_keys: list[str] = []
    session_count = 0
    scrub_totals = {"secrets_redacted": 0}
    parse_errors: list[str] = []

    for f in files:
        raw = await f.read()
        if len(raw) > max_file:
            raise HTTPException(status_code=400,
                                detail=f"{f.filename}: exceeds {settings.FLUENCY_MAX_FILE_MB}MB")
        total += len(raw)
        if total > max_total:
            raise HTTPException(status_code=400,
                                detail=f"Total upload exceeds {settings.FLUENCY_MAX_TOTAL_MB}MB")

        # Scrub BEFORE storage — secrets never persist. CPU-bound regex work
        # runs in the threadpool to keep the event loop responsive.
        scrubbed, stats = await loop.run_in_executor(None, scrub_transcript_bytes, raw)
        scrub_totals["secrets_redacted"] += stats["secrets_redacted"]

        # Validate it actually parses as a Claude Code transcript.
        try:
            parse_claude_code_jsonl(scrubbed, fallback_session_id=f.filename or "upload")
            session_count += 1
        except TranscriptParseError as exc:
            parse_errors.append(f"{f.filename}: {exc}")
            continue

        key = await loop.run_in_executor(
            None, store.store_transcript, scrubbed, assignment.id, submission.id,
            f.filename or "session.jsonl",
        )
        stored_keys.append(key)

    if not stored_keys:
        raise HTTPException(
            status_code=400,
            detail="No valid Claude Code transcripts found. Upload the .jsonl session files "
                   f"from ~/.claude/projects/<your-project>/. ({'; '.join(parse_errors[:3])})",
        )

    # Accept git metadata only if it's valid JSON and reasonably sized (the CLL
    # sends a bounded snapshot; reject anything else rather than store junk).
    clean_git = None
    if git_metadata:
        try:
            parsed = json.loads(git_metadata)
            if isinstance(parsed, dict):
                clean_git = json.dumps(parsed)[:8000]
        except (ValueError, TypeError):
            clean_git = None

    submission.transcript_file_keys = json.dumps(stored_keys)
    submission.transcript_bytes = total
    submission.session_count = session_count
    submission.repo_url = (repo_url or "").strip()[:500] or None
    submission.git_metadata = clean_git
    submission.submit_source = "cli" if submit_source == "cli" else "web"
    submission.status = "submitted"
    submission.submitted_at = datetime.now(timezone.utc)
    submission.error = None
    db.commit()

    dispatch_fluency_analysis(submission.id)
    logger.info("Assignment submission %s: %d files stored, %d secrets redacted, analysis dispatched",
                submission.id, len(stored_keys), scrub_totals["secrets_redacted"])

    return candidate_view(token, db)
