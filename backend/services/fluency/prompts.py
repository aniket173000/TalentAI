"""
Rubric definition and prompt builders for the AI-fluency judge.

The rubric is the product. Every dimension is phrased so the judge scores
OBSERVABLE BEHAVIOR in the transcript, cites verbatim evidence, and admits
low confidence when a dimension simply didn't come up.
"""
from __future__ import annotations

import json

# The scoring rubric. `weight` is the dimension's share of the overall score and
# the eight weights sum to 100 — the overall is a weighted average of the observed
# dimensions (see pipeline._weighted_overall), renormalized over whatever was
# actually exercised in the transcript. `desc` is the judge-facing instruction for
# each dimension; it lives ONLY here (backend) — the frontend renders reports from
# the returned label/score/note/evidence and never needs this text.
RUBRIC: list[dict] = [
    {
        "key": "planning_decomposition",
        "label": "Planning & Decomposition",
        "weight": 20,
        "desc": "Ability to break complex work into executable tasks. Did the candidate "
                "open with a plan/architecture discussion and decompose the project into "
                "scoped, ordered steps — or fire one vague mega-prompt and hope?",
    },
    {
        "key": "context_engineering",
        "label": "Context Engineering",
        "weight": 20,
        "desc": "Quality of prompts, specifications, constraints, and examples. Do the "
                "candidate's prompts supply concrete requirements, constraints, sample "
                "inputs/outputs, and expected behavior — or leave the AI guessing?",
    },
    {
        "key": "verification_validation",
        "label": "Verification & Validation",
        "weight": 15,
        "desc": "Testing, checking outputs, and proving correctness. Did they run "
                "tests/builds, review diffs, exercise the app, and confirm results — or "
                "blind-accept generated code?",
    },
    {
        "key": "debugging_rca",
        "label": "Debugging & Root Cause Analysis",
        "weight": 15,
        "desc": "Finding and fixing issues systematically. When things broke, was it "
                "hypothesis-driven (narrowing scope, adding logs, reading errors, isolating "
                "the cause) — or paste-the-error-and-pray loops?",
    },
    {
        "key": "architectural_reasoning",
        "label": "Architectural & Long-Term Reasoning",
        "weight": 10,
        "desc": "Scalability, maintainability, and future-proofing. Did they weigh "
                "trade-offs, structure, and future requirements with the AI — or take the "
                "first answer every time?",
    },
    {
        "key": "critical_thinking",
        "label": "Critical Thinking / Pushback",
        "weight": 10,
        "desc": "Challenging AI assumptions and spotting mistakes. Did they question, "
                "correct, or reject an AI suggestion with reasoning? A strong seniority "
                "signal — absence is neutral, presence is a plus.",
    },
    {
        "key": "efficiency_leverage",
        "label": "Efficiency & AI Leverage",
        "weight": 5,
        "desc": "Using AI to accelerate delivery. Progress per interaction: steady "
                "convergence toward the goal and good use of the AI's strengths vs thrash, "
                "abandoned directions, and repeated re-explanations.",
    },
    {
        "key": "edge_cases_reliability",
        "label": "Edge Cases & Reliability",
        "weight": 5,
        "desc": "Thinking about failure modes and corner cases. Did the CANDIDATE "
                "proactively raise edge cases, error handling, validation, concurrency, or "
                "reliability concerns (not just accept what the AI mentioned)?",
    },
]

RUBRIC_KEYS = [d["key"] for d in RUBRIC]

# Defensive: the overall-score math assumes these sum to 100.
assert sum(d["weight"] for d in RUBRIC) == 100, "RUBRIC weights must sum to 100"


def _rubric_block() -> str:
    return "\n".join(
        f"- {d['key']} (weight {d['weight']}%): {d['label']} — {d['desc']}" for d in RUBRIC
    )


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
- Each dimension carries the weight shown above (they sum to 100). The final overall
  is a WEIGHTED average of the dimensions you score, renormalized over the ones that
  were actually observed — so put your effort into calibrating each dimension score
  accurately; the heavily-weighted ones (Planning & Decomposition, Context Engineering)
  move the needle most.
- overall_score should reflect that weighting and the metrics
  (e.g. verification_runs=0 in metrics caps Verification & Validation).
- Critical Thinking / Pushback: absence is neutral (score null), presence scores high."""
