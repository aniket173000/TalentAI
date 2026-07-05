"""
S3 resume file storage service.

Gracefully degrades when S3 is not configured — callers receive None
instead of a key, and the app falls back to text-only mode.

Upload is synchronous (boto3 is sync-only).  Call upload_resume_file()
from a FastAPI async route via asyncio.get_event_loop().run_in_executor()
to avoid blocking the event loop.
"""

import logging
import uuid
from functools import lru_cache
from pathlib import Path

from config import settings

logger = logging.getLogger(__name__)

# Map file extension → (S3 ContentType, Content-Disposition style)
_EXT_META: dict[str, tuple[str, str]] = {
    ".pdf":  ("application/pdf", "inline"),
    ".docx": (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "attachment",
    ),
    ".doc":  ("application/msword", "attachment"),
    ".txt":  ("text/plain", "inline"),
}

_DEFAULT_CONTENT_TYPE = "application/octet-stream"


def s3_enabled() -> bool:
    return bool(settings.S3_BUCKET and settings.AWS_ACCESS_KEY_ID)


@lru_cache(maxsize=1)
def _client():
    import boto3
    return boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION,
    )


def upload_resume_file(content: bytes, filename: str, user_id: int) -> str | None:
    """
    Upload the raw resume bytes to S3.

    Returns the S3 object key on success, or None if S3 is not configured
    or the upload fails (so the caller can proceed without a stored file).
    """
    if not s3_enabled():
        return None

    ext = Path(filename).suffix.lower()
    content_type, disposition = _EXT_META.get(ext, (_DEFAULT_CONTENT_TYPE, "attachment"))
    key = f"resumes/{user_id}/{uuid.uuid4().hex}{ext}"

    try:
        _client().put_object(
            Bucket=settings.S3_BUCKET,
            Key=key,
            Body=content,
            ContentType=content_type,
            ContentDisposition=f'{disposition}; filename="{filename}"',
        )
        logger.info("Uploaded resume to S3: %s", key)
        return key
    except Exception as exc:
        logger.warning("S3 upload failed (key=%s): %s", key, exc)
        return None


def get_presigned_url(file_key: str, filename: str) -> str | None:
    """
    Generate a pre-signed GET URL for the given S3 key.

    Returns the URL string (valid for settings.S3_PRESIGN_EXPIRY seconds),
    or None if S3 is not configured or the operation fails.

    Note: presigned URL generation is a local computation — no network call.
    Common failure cause: AWS_REGION in .env doesn't match the bucket's actual region.
    """
    if not s3_enabled():
        return None

    ext = Path(filename).suffix.lower()
    _, disposition = _EXT_META.get(ext, (_DEFAULT_CONTENT_TYPE, "attachment"))

    try:
        url = _client().generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.S3_BUCKET,
                "Key": file_key,
                "ResponseContentDisposition": f'{disposition}; filename="{filename}"',
            },
            ExpiresIn=settings.S3_PRESIGN_EXPIRY,
        )
        logger.info("Presigned URL generated (key=%s, region=%s)", file_key, settings.AWS_REGION)
        return url
    except Exception as exc:
        logger.error(
            "Presigned URL generation FAILED (key=%s, bucket=%s, region=%s): %s",
            file_key, settings.S3_BUCKET, settings.AWS_REGION, exc,
        )
        return None


def upload_avatar(content: bytes, user_id: int, filename: str) -> str | None:
    """
    Upload a profile avatar image to S3.

    Stored under resumes/{user_id}/avatar/ so it uses the same IAM permission
    path as resume uploads (no extra bucket policy needed).
    Returns the S3 object key on success, or None on failure.
    """
    if not s3_enabled():
        return None

    ext = Path(filename).suffix.lower() or ".jpg"
    ct_map = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }
    content_type = ct_map.get(ext, "image/jpeg")
    key = f"resumes/{user_id}/avatar/{uuid.uuid4().hex}{ext}"

    try:
        _client().put_object(
            Bucket=settings.S3_BUCKET,
            Key=key,
            Body=content,
            ContentType=content_type,
            ContentDisposition=f'inline; filename="avatar{ext}"',
        )
        logger.info("Uploaded avatar to S3: %s", key)
        return key
    except Exception as exc:
        logger.warning("Avatar S3 upload failed: %s", exc)
        return None


def upload_transcript_file(content: bytes, assignment_id: int,
                           submission_id: int, filename: str) -> str | None:
    """
    Store one (already-scrubbed) transcript session file for an assignment
    submission. Returns the S3 key, or None if S3 is unavailable/failed.
    """
    if not s3_enabled():
        return None

    safe = Path(filename).name or "session.jsonl"
    key = f"assignments/{assignment_id}/{submission_id}/{uuid.uuid4().hex}-{safe}"
    try:
        _client().put_object(
            Bucket=settings.S3_BUCKET,
            Key=key,
            Body=content,
            ContentType="application/jsonl",
            ContentDisposition=f'attachment; filename="{safe}"',
        )
        logger.info("Uploaded transcript to S3: %s (%d bytes)", key, len(content))
        return key
    except Exception as exc:
        logger.warning("Transcript S3 upload failed (key=%s): %s", key, exc)
        return None


def download_file(file_key: str) -> bytes | None:
    """Fetch an object's bytes from S3. Returns None if unavailable or missing."""
    if not s3_enabled() or not file_key:
        return None
    try:
        obj = _client().get_object(Bucket=settings.S3_BUCKET, Key=file_key)
        return obj["Body"].read()
    except Exception as exc:
        logger.warning("S3 download failed (key=%s): %s", file_key, exc)
        return None


def check_file_exists(file_key: str) -> bool:
    """Check whether an object exists in S3 via head_object. Returns False on any error."""
    if not s3_enabled() or not file_key:
        return False
    try:
        _client().head_object(Bucket=settings.S3_BUCKET, Key=file_key)
        return True
    except Exception:
        return False


def delete_file(file_key: str) -> None:
    """Delete an object from S3. Errors are logged and swallowed."""
    if not s3_enabled() or not file_key:
        return
    try:
        _client().delete_object(Bucket=settings.S3_BUCKET, Key=file_key)
    except Exception as exc:
        logger.warning("S3 delete failed (key=%s): %s", file_key, exc)
