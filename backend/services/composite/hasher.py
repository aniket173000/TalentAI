"""
InputHasher — deterministic SHA-256 fingerprint for a composite score computation.

A matching hash means "the same inputs were used" → return the cached DB record
instead of re-computing.  This makes composite scoring idempotent per PRD spec.

Inputs captured in the hash:
  - model_version        — changes when scoring algorithm changes
  - candidate_profile_id — identifies which profile snapshot was scored
  - source_resume_hash   — SHA-256 of resume text; changes if resume was updated
  - job_id               — which job
  - jd_requirements_hash — SHA-256 of serialised JD requirements; changes if JD was re-parsed

All inputs are serialised with sorted keys so the hash is deterministic regardless
of dict insertion order.
"""

from __future__ import annotations

import hashlib
import json


class InputHasher:
    """
    Stateless hasher.  Instantiate once as a module-level singleton.

    compute() → 64-char hex SHA-256 digest.
    """

    def compute(
        self,
        model_version: str,
        candidate_profile_id: int,
        source_resume_hash: str | None,
        job_id: int,
        jd_requirements_json: str | None,
    ) -> str:
        """
        Return a deterministic SHA-256 hash of all scoring inputs.

        source_resume_hash    — CandidateProfile.source_resume_hash (already a SHA-256)
        jd_requirements_json  — Job.jd_requirements (raw JSON string)
        """
        jd_hash = (
            hashlib.sha256(jd_requirements_json.encode()).hexdigest()
            if jd_requirements_json
            else ""
        )

        payload = {
            "model_version": model_version,
            "profile_id": candidate_profile_id,
            "resume_hash": source_resume_hash or "",
            "job_id": job_id,
            "jd_hash": jd_hash,
        }

        canonical = json.dumps(payload, sort_keys=True)
        return hashlib.sha256(canonical.encode()).hexdigest()
