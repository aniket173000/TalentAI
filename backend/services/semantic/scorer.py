"""
SkillScorer — translates a SkillMatchResult into a 0–30 numeric sub-score.

Single responsibility: pure scoring math, no I/O, no network, no DB.

Scoring formula:
  required_groups  = groups where required=True
  group_score(g)   = g.satisfaction × (MAX_SCORE / len(required_groups))
  total_score      = Σ group_score(g)  [capped at MAX_SCORE]

Satisfaction per group:
  match_type="any" → 1.0 if ≥1 skill matched, else 0.0   (binary: one match = full credit)
  match_type="all" → matched / total  (partial credit for AND groups)

Edge cases:
  - No required groups → MAX_SCORE (job has no skill requirements)
  - All groups satisfied → MAX_SCORE (30.0)
  - No groups satisfied → 0.0
"""

from services.semantic.models import GroupMatchOutcome, SkillMatchResult, SkillScoreBreakdown


class SkillScorer:
    """
    Stateless scorer — safe to instantiate once as a module-level singleton.
    The max_score is configurable so future stories can adjust the weight of
    the skills sub-score within a composite scoring formula.
    """

    def __init__(self, max_score: float = 30.0) -> None:
        if max_score <= 0:
            raise ValueError(f"max_score must be positive, got {max_score}")
        self.max_score = max_score

    def compute(self, match_result: SkillMatchResult) -> SkillScoreBreakdown:
        """
        Compute the 0–MAX_SCORE sub-score from a SkillMatchResult.
        Only required groups contribute to the score.
        """
        required = match_result.required_outcomes

        # No requirements → full marks (job doesn't gate on specific skills)
        if not required:
            return SkillScoreBreakdown(
                score=self.max_score,
                max_score=self.max_score,
                total_required_groups=0,
                satisfied_groups=0,
                match_percentage=100.0,
                satisfied_outcomes=[],
                missing_outcomes=[],
            )

        weight_per_group = self.max_score / len(required)
        total_score = 0.0
        satisfied: list[GroupMatchOutcome] = []
        missing: list[GroupMatchOutcome] = []

        for outcome in required:
            group_score = outcome.satisfaction * weight_per_group
            total_score += group_score
            if outcome.is_satisfied:
                satisfied.append(outcome)
            else:
                missing.append(outcome)

        # Clamp to [0, max_score] to absorb any floating-point drift
        total_score = max(0.0, min(self.max_score, total_score))
        match_pct = (total_score / self.max_score) * 100.0

        return SkillScoreBreakdown(
            score=total_score,
            max_score=self.max_score,
            total_required_groups=len(required),
            satisfied_groups=len(satisfied),
            match_percentage=match_pct,
            satisfied_outcomes=satisfied,
            missing_outcomes=missing,
        )
