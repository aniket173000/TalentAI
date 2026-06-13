"""
Domain models for semantic skill matching.

Pure dataclasses — no framework dependencies, no I/O.
Consumed by SkillMatcher (produces) and SkillScorer (consumes).
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class SkillMatch:
    """
    One resolved pair: a JD skill that was matched to a candidate skill.
    Immutable — produced by SkillMatcher, read by SkillScorer / API layer.
    """
    jd_skill: str
    candidate_skill: str
    similarity: float       # cosine similarity, 0.0–1.0


@dataclass
class GroupMatchOutcome:
    """
    Result of evaluating one SkillGroup against the full candidate skill set.

    satisfaction — float 0.0–1.0:
      match_type="any"  → 1.0 if ≥1 skill matched, else 0.0
      match_type="all"  → matched_count / total_count  (partial credit)

    is_satisfied — bool:
      "any" → at least one match
      "all" → every skill in the group matched
    """
    group_skills: list[str]
    match_type: str          # "any" | "all"
    required: bool
    context: str
    matches: list[SkillMatch] = field(default_factory=list)

    @property
    def satisfaction(self) -> float:
        if not self.group_skills:
            return 1.0
        if self.match_type == "any":
            return 1.0 if self.matches else 0.0
        return len(self.matches) / len(self.group_skills)

    @property
    def is_satisfied(self) -> bool:
        if self.match_type == "any":
            return len(self.matches) > 0
        return len(self.matches) == len(self.group_skills)

    @property
    def best_match(self) -> SkillMatch | None:
        """Highest-similarity match in this group (useful for explanations)."""
        return max(self.matches, key=lambda m: m.similarity) if self.matches else None


@dataclass
class SkillMatchResult:
    """
    All group outcomes for one candidate × JD pair.
    Produced by SkillMatcher; consumed by SkillScorer.
    """
    outcomes: list[GroupMatchOutcome] = field(default_factory=list)

    @property
    def required_outcomes(self) -> list[GroupMatchOutcome]:
        return [o for o in self.outcomes if o.required]

    @property
    def preferred_outcomes(self) -> list[GroupMatchOutcome]:
        return [o for o in self.outcomes if not o.required]


@dataclass
class SkillScoreBreakdown:
    """
    Final output of SkillScorer.
    score is the 0–30 sub-score that feeds into the composite match score.
    """
    score: float                                  # 0–30
    max_score: float                              # always 30.0
    total_required_groups: int
    satisfied_groups: int
    match_percentage: float                       # 0–100
    satisfied_outcomes: list[GroupMatchOutcome]
    missing_outcomes: list[GroupMatchOutcome]

    def to_dict(self) -> dict:
        """Serialise to a plain dict for JSON responses and DB storage."""
        def _outcome(o: GroupMatchOutcome) -> dict:
            return {
                "group_skills": o.group_skills,
                "match_type": o.match_type,
                "required": o.required,
                "context": o.context,
                "satisfied": o.is_satisfied,
                "satisfaction": round(o.satisfaction, 3),
                "matches": [
                    {
                        "jd_skill": m.jd_skill,
                        "candidate_skill": m.candidate_skill,
                        "similarity": round(m.similarity, 4),
                    }
                    for m in o.matches
                ],
            }

        return {
            "score": round(self.score, 2),
            "max_score": self.max_score,
            "total_required_groups": self.total_required_groups,
            "satisfied_groups": self.satisfied_groups,
            "match_percentage": round(self.match_percentage, 1),
            "satisfied_outcomes": [_outcome(o) for o in self.satisfied_outcomes],
            "missing_outcomes": [_outcome(o) for o in self.missing_outcomes],
        }
