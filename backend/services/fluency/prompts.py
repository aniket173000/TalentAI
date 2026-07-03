"""
Rubric definition and prompt builders for the AI-fluency judge.

The rubric is the product. Every dimension is phrased so the judge scores
OBSERVABLE BEHAVIOR in the transcript, cites verbatim evidence, and admits
low confidence when a dimension simply didn't come up.
"""
from __future__ import annotations

import json

RUBRIC: list[dict] = [
    {
        "key": "planning_decomposition",
        "label": "Planning & decomposition",
        "desc": "Did the candidate start with architecture/plan discussion and break the "
                "project into scoped steps, or fire one vague mega-prompt and hope?",
    },
    {
        "key": "context_provisioning",
        "label": "Context provisioning",
        "desc": "Do prompts include concrete requirements, constraints, examples, and "
                "expected behavior — or leave the AI guessing?",
    },
    {
        "key": "edge_case_thinking",
        "label": "Edge-case thinking",
        "desc": "Did the CANDIDATE proactively raise edge cases, error handling, "
                "validation, concurrency, or failure modes (not just accept what the AI mentioned)?",
    },
    {
        "key": "longterm_reasoning",
        "label": "Long-term / architectural reasoning",
        "desc": "Did they discuss trade-offs, scalability, maintainability, or future "
                "requirements with the AI — or take the first answer every time?",
    },
    {
        "key": "verification_behavior",
        "label": "Verification behavior",
        "desc": "Did they run tests/builds, review diffs, exercise the app, and catch AI "
                "mistakes — or blind-accept generated code?",
    },
    {
        "key": "debugging_quality",
        "label": "Debugging quality",
        "desc": "When things broke: hypothesis-driven iteration (narrowing, adding logs, "
                "reading errors) vs paste-the-error-and-pray loops?",
    },
    {
        "key": "critical_pushback",
        "label": "Critical pushback",
        "desc": "Did they ever question, correct, or reject an AI suggestion with reasoning? "
                "This is a strong seniority signal — absence is neutral, presence is a plus.",
    },
    {
        "key": "efficiency",
        "label": "Efficiency & direction",
        "desc": "Progress per interaction: steady convergence toward the goal vs thrash, "
                "abandoned directions, and repeated re-explanations.",
    },
]

RUBRIC_KEYS = [d["key"] for d in RUBRIC]


def _rubric_block() -> str:
    return "\n".join(f"- {d['key']}: {d['label']} — {d['desc']}" for d in RUBRIC)


CHUNK_SYSTEM = (
    "You are an expert engineering-hiring assessor. You are reading a portion of a "
    "candidate's AI-assisted coding session transcript (they built a take-home project "
    "with an AI coding agent). Judge ONLY the candidate's behavior — the human PROMPTs — "
    "not the quality of the AI's output. Cite evidence verbatim. If a dimension does not "
    "appear in this portion, say so instead of inventing a score. "
    "Respond with valid JSON only."
)


def build_chunk_prompt(chunk_text: str, assignment_brief: str,
                       evaluation_focus: str | None) -> str:
    focus = f"\nRECRUITER'S EVALUATION FOCUS: {evaluation_focus}" if evaluation_focus else ""
    return f"""A candidate built this take-home project using an AI coding agent:

ASSIGNMENT BRIEF:
{assignment_brief[:1500]}{focus}

RUBRIC DIMENSIONS:
{_rubric_block()}

TRANSCRIPT PORTION (chronological; [PROMPT] = what the candidate typed,
[AI] = assistant reply, [TOOL] = action the agent took, [RESULT] = tool output):

{chunk_text}

Return JSON with exactly these keys:
{{
  "observations": [
    {{
      "dimension": "<one of: {', '.join(RUBRIC_KEYS)}>",
      "signal": "positive" | "negative",
      "evidence": "<short VERBATIM quote from a [PROMPT], max 200 chars>",
      "note": "<one sentence on why this quote matters>"
    }}
  ],
  "provisional_scores": {{ "<dimension_key>": <0-100 or null if not observable here> }},
  "chunk_summary": "<2 sentences: what happened in this portion>"
}}

Rules: every observation MUST quote a real [PROMPT] line. 3-10 observations.
Score null for dimensions with no evidence in this portion — do not guess."""


AGGREGATE_SYSTEM = (
    "You are an expert engineering-hiring assessor writing the final AI-fluency report "
    "for a recruiter. You are given per-portion analyses of the candidate's full "
    "transcript plus deterministic metrics computed from it. Be honest and calibrated: "
    "recruiters make interview decisions on this. Never exceed what the evidence "
    "supports. Respond with valid JSON only."
)


def build_aggregate_prompt(chunk_results: list[dict], metrics: dict,
                           integrity_flags: list[dict], assignment_brief: str,
                           evaluation_focus: str | None) -> str:
    focus = f"\nRECRUITER'S EVALUATION FOCUS: {evaluation_focus}" if evaluation_focus else ""
    return f"""ASSIGNMENT BRIEF:
{assignment_brief[:1500]}{focus}

DETERMINISTIC METRICS (computed from the full transcript, trustworthy):
{json.dumps(metrics, indent=1)}

INTEGRITY FLAGS (heuristic anomaly signals):
{json.dumps(integrity_flags, indent=1)}

PER-PORTION ANALYSES (chronological):
{json.dumps(chunk_results, indent=1)[:60000]}

RUBRIC DIMENSIONS:
{_rubric_block()}

Produce the final report as JSON with exactly these keys:
{{
  "overall_score": <0-100, weighted judgment across dimensions>,
  "summary": "<4-6 sentence recruiter-facing narrative: how this candidate works with AI, their strongest and weakest habits, and what to probe in an interview>",
  "dimensions": [
    {{
      "key": "<dimension_key>",
      "label": "<dimension label>",
      "score": <0-100 or null if never observable>,
      "confidence": "high" | "medium" | "low",
      "note": "<1-2 sentences>",
      "evidence": ["<up to 3 verbatim quotes carried from the portion analyses>"]
    }}
  ],
  "highlights": {{
    "best_moment": "<the single most impressive candidate prompt/behavior, with quote>",
    "growth_area": "<the clearest missed opportunity or weak habit, with quote>"
  }},
  "interview_questions": ["<2-3 targeted questions the recruiter should ask, derived from gaps in the transcript>"]
}}

Rules:
- Include ALL {len(RUBRIC)} dimensions in "dimensions", in rubric order.
- A dimension nobody exercised gets score null + confidence "low" — never a made-up number.
- overall_score must be consistent with the dimension scores and metrics
  (e.g. verification_runs=0 in metrics caps verification_behavior).
- critical_pushback: absence is neutral (score null), presence scores high."""
