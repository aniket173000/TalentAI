"""
Secret scrubbing for candidate transcripts.

Applied to the RAW uploaded bytes BEFORE they are stored in S3, so leaked
credentials never persist in our infrastructure. Transcripts leak secrets
constantly (candidates paste .env files, export keys in bash commands, and
tool results echo them back).

Patterns are conservative: prefer redacting a false positive over storing a
real key. Each match is replaced with a same-purpose placeholder so the
transcript still reads naturally for the judge ("export OPENAI_API_KEY=
[REDACTED_SECRET]" keeps the behavioral signal).

Also strips base64 image payloads — 35% of raw transcript bytes in measured
real-world sessions, zero scoring signal, and screenshots may contain
sensitive content from the candidate's machine.
"""
from __future__ import annotations

import re

REDACTED = "[REDACTED_SECRET]"

_SECRET_PATTERNS: list[re.Pattern] = [
    # Provider-prefixed API keys
    re.compile(r"sk-[A-Za-z0-9_\-]{20,}"),                       # OpenAI / Anthropic / Stripe secret
    re.compile(r"sk-ant-[A-Za-z0-9_\-]{20,}"),                   # Anthropic
    re.compile(r"(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}"),     # GitHub tokens
    re.compile(r"github_pat_[A-Za-z0-9_]{22,}"),                 # GitHub fine-grained PAT
    re.compile(r"xox[baprs]-[A-Za-z0-9\-]{10,}"),                # Slack
    re.compile(r"AIza[0-9A-Za-z\-_]{35}"),                       # Google API key
    re.compile(r"AKIA[0-9A-Z]{16}"),                             # AWS access key id
    re.compile(r"rzp_(?:live|test)_[A-Za-z0-9]{10,}"),           # Razorpay
    re.compile(r"pk_(?:live|test)_[A-Za-z0-9]{20,}"),            # Stripe publishable (live)
    re.compile(r"whsec_[A-Za-z0-9]{20,}"),                       # webhook signing secrets
    re.compile(r"ntn_[A-Za-z0-9]{30,}"),                         # Notion
    # JWTs (three base64url segments)
    re.compile(r"eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}"),
    # Private key blocks
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----"),
    # Connection strings with inline credentials (postgres://user:pass@host)
    re.compile(r"(?i)\b((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|rediss|amqp)://[^\s:/@\"']+):([^\s@\"']+)@"),
    # KEY=value assignments for secret-looking env var names
    re.compile(
        r"(?i)\b([A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|API_KEY|APIKEY|ACCESS_KEY|"
        r"AUTH_TOKEN|PRIVATE_KEY|CLIENT_SECRET|SIGNING_KEY)[A-Z0-9_]*)"
        r"(\s*[=:]\s*)([\"']?)([^\s\"',;]{8,})(\3)"
    ),
]

# JSON image blocks in Claude Code transcripts:
#   {"type":"image","source":{"type":"base64","media_type":"image/png","data":"<huge>"}}
_BASE64_IMAGE_DATA = re.compile(r'("data"\s*:\s*")[A-Za-z0-9+/=]{512,}(")')
# Any other very long base64 run (embedded PDFs, blobs) — no scoring value.
_LONG_BASE64 = re.compile(r"[A-Za-z0-9+/]{2048,}={0,2}")


def scrub_text(text: str) -> tuple[str, int]:
    """Redact secrets in `text`. Returns (scrubbed_text, redaction_count)."""
    count = 0

    def _sub_simple(m: re.Match) -> str:
        nonlocal count
        count += 1
        return REDACTED

    def _sub_conn(m: re.Match) -> str:
        nonlocal count
        count += 1
        return f"{m.group(1)}:{REDACTED}@"

    def _sub_env(m: re.Match) -> str:
        nonlocal count
        count += 1
        return f"{m.group(1)}{m.group(2)}{m.group(3)}{REDACTED}{m.group(5)}"

    for pattern in _SECRET_PATTERNS:
        if pattern.groups >= 5:
            text = pattern.sub(_sub_env, text)
        elif pattern.groups == 2:
            text = pattern.sub(_sub_conn, text)
        else:
            text = pattern.sub(_sub_simple, text)
    return text, count


def scrub_transcript_bytes(raw: bytes) -> tuple[bytes, dict]:
    """
    Scrub an uploaded transcript file: strip base64 image payloads, then
    redact secrets. Operates line-by-line so one malformed line can't blow
    memory, and JSONL structure is preserved.

    Returns (scrubbed_bytes, stats).
    """
    out_lines: list[str] = []
    secrets = 0
    images_stripped = 0

    for raw_line in raw.decode("utf-8", errors="replace").splitlines():
        line = raw_line

        line, n_img = _BASE64_IMAGE_DATA.subn(r"\1[IMAGE_STRIPPED]\2", line)
        images_stripped += n_img
        line, n_blob = _LONG_BASE64.subn("[BINARY_STRIPPED]", line)
        images_stripped += n_blob

        line, n_sec = scrub_text(line)
        secrets += n_sec
        out_lines.append(line)

    scrubbed = "\n".join(out_lines).encode("utf-8")
    return scrubbed, {
        "secrets_redacted": secrets,
        "binary_blocks_stripped": images_stripped,
        "bytes_before": len(raw),
        "bytes_after": len(scrubbed),
    }
