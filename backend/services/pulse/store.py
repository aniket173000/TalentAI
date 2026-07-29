"""
Pulse transcript persistence — S3-first with local-disk fallback.

Mirrors services/fluency/store.py but under a `pulse/` prefix so the team
product's objects never collide with hiring-assignment objects. Keys are
"s3:<key>" | "local:<rel>"; the local root is pulse-specific, so this module
owns its own read path (the fluency loader resolves local keys under the
assignments root, which would misroute pulse files).
"""
from __future__ import annotations

import logging
import re
import uuid
from pathlib import Path

from services import storage_service

logger = logging.getLogger(__name__)

_LOCAL_ROOT = Path(__file__).resolve().parent.parent.parent / "uploads" / "pulse"


def _safe_name(filename: str) -> str:
    name = Path(filename).name or "session.jsonl"
    return re.sub(r"[^\w.\-]", "_", name)[:120]


def store_transcript(content: bytes, org_id: int, submission_id: int,
                     filename: str) -> str:
    key = storage_service.upload_pulse_transcript_file(content, org_id, submission_id, filename)
    if key:
        return f"s3:{key}"

    rel = Path(str(org_id)) / str(submission_id) / f"{uuid.uuid4().hex}-{_safe_name(filename)}"
    path = _LOCAL_ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    logger.info("Stored pulse transcript locally (S3 unavailable): %s", path)
    return f"local:{rel.as_posix()}"


def load_transcript(key: str) -> bytes | None:
    if key.startswith("s3:"):
        return storage_service.download_file(key[3:])
    if key.startswith("local:"):
        rel = key[len("local:"):]
        path = (_LOCAL_ROOT / rel).resolve()
        # Refuse anything that escapes the uploads root (defense in depth).
        if not str(path).startswith(str(_LOCAL_ROOT.resolve())):
            logger.error("Refusing pulse transcript path outside uploads root: %s", key)
            return None
        try:
            return path.read_bytes()
        except OSError as exc:
            logger.warning("Local pulse transcript read failed (%s): %s", key, exc)
            return None
    logger.error("Unknown transcript key scheme: %s", key)
    return None
