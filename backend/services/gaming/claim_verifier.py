"""
Feature 4: Claim verification.

For each newly added skill, asks the LLM whether the candidate's work history
or project descriptions actually provide evidence of that skill.
"""
import logging

from services.ai_service import verify_skill_claims as _llm_verify

logger = logging.getLogger(__name__)


async def verify_skill_claims(
    added_skills: list[str],
    resume_text: str,
) -> dict:
    """
    Returns:
      skill_evidence    — dict: skill → {has_evidence, confidence, reason}
      unsupported_skills — skills where has_evidence is False
    """
    if not added_skills:
        return {"skill_evidence": {}, "unsupported_skills": []}

    try:
        evidence = await _llm_verify(added_skills, resume_text)
    except Exception as exc:
        logger.warning("claim_verifier: LLM call failed, defaulting to has_evidence=True: %s", exc)
        # Safe fallback — don't penalise candidate if LLM is unavailable
        evidence = {s: {"has_evidence": True, "confidence": 1.0, "reason": "verification unavailable"} for s in added_skills}

    unsupported = [
        skill for skill, result in evidence.items()
        if not result.get("has_evidence", True)
    ]

    return {"skill_evidence": evidence, "unsupported_skills": unsupported}
