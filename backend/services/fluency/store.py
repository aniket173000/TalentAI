"""
Transcript persistence with S3-first, local-disk fallback.

Production uses S3 (durable, shared across API + Celery workers). Local dev
without S3 credentials falls back to backend/uploads/ so the feature works
end-to-end out of the box. Keys are prefixed so a mixed environment never
misroutes: "s3:<key>" vs "local:<relative path>".

NOTE: the local fallback assumes API and worker share a filesystem — true for
dev and single-host deploys. Multi-host production must configure S3.
"""
from __future__ import annotations

import logging
import re
import uuid
from pathlib import Path

from services import storage_service

logger = logging.getLogger(__name__)

_LOCAL_ROOT = Path(__file__).resolve().parent.parent.parent / "uploads" / "assignments"


def _safe_name(filename: str) -> str:
    name = Path(filename).name or "session.jsonl"
    return re.sub(r"[^\w.\-]", "_", name)[:120]


def store_transcript(content: bytes, assignment_id: int, submission_id: int,
                     filename: str) -> str:
    key = storage_service.upload_transcript_file(content, assignment_id, submission_id, filename)
    if key:
        return f"s3:{key}"

    rel = Path(str(assignment_id)) / str(submission_id) / f"{uuid.uuid4().hex}-{_safe_name(filename)}"
    path = _LOCAL_ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    logger.info("Stored transcript locally (S3 unavailable): %s", path)
    return f"local:{rel.as_posix()}"


def load_transcript(key: str) -> bytes | None:
    if key.startswith("s3:"):
        return storage_service.download_file(key[3:])
    if key.startswith("local:"):
        rel = key[len("local:"):]
        path = (_LOCAL_ROOT / rel).resolve()
        # Refuse anything that escapes the uploads root (defense in depth —
        # keys come from our own DB, but they transit JSON).
        if not str(path).startswith(str(_LOCAL_ROOT.resolve())):
            logger.error("Refusing transcript path outside uploads root: %s", key)
            return None
        try:
            return path.read_bytes()
        except OSError as exc:
            logger.warning("Local transcript read failed (%s): %s", key, exc)
            return None
    logger.error("Unknown transcript key scheme: %s", key)
    return None
