"""
ComplexityAnalyzer — detects complexity and impact signals in project text.

Single responsibility: pattern detection only.  No scoring math.

Signals detected:
  1. team_size       — "team of 5", "led 3 engineers", "5-member team"
  2. scale           — "1M users", "10 TB", "50K requests/sec", "$2M revenue"
  3. measurable_impact — "50% reduction", "2× faster", "$5M saved"
  4. github_or_oss   — github.com/gitlab.com URL, or "open-source"/"open source"
"""

from __future__ import annotations

import re

from services.projects.models import ComplexitySignals

# ── Compiled patterns ─────────────────────────────────────────────────────────

_TEAM_SIZE = re.compile(
    r"""
    # "team of N" / "team of N+"
    team\s+of\s+\d+
    |
    # "led/managed/mentored N engineers/people"
    \b(?:led|managed|managed\s+a|mentored|supervised|coordinated|guided)\s+\d+
    |
    # "N-member team" / "N-person team" / "N engineers"
    \b\d+[-\s](?:member|person|engineer|developer|contributor|people)
    |
    # "team of N members" / "team with N"
    team\s+(?:of|with)\s+\d+
    |
    # "N-engineer" / "5 engineers"
    \b\d+\s+(?:engineers|developers|contributors|members|colleagues)
    """,
    re.VERBOSE | re.IGNORECASE,
)

_SCALE = re.compile(
    r"""
    # "10M users" / "10 million users"
    \b\d+(?:\.\d+)?\s*(?:m|million|b|billion|k|thousand)\s*\+?\s*
        (?:users|customers|downloads|installs|requests|messages|records|transactions|events)
    |
    # "10K users" / "50K requests/second"
    \b\d+(?:\.\d+)?[kK]\+?\s*
        (?:users|customers|downloads|requests|messages|records|transactions)
    |
    # "10 TB" / "500 GB" / "petabytes"
    \b\d+(?:\.\d+)?\s*(?:TB|GB|PB|MB|terabyte|gigabyte|petabyte)
    |
    # "$2M revenue" / "$500K ARR" — dollar amounts tied to business scale metrics only
    \$\s*\d+(?:\.\d+)?\s*[MKBmkb]\s+(?:revenue|arr|mrr|gmv|funding|sales|valuation)
    |
    # "serving N requests"
    serving\s+\d+(?:\.\d+)?\s*[KkMm]?\+?
    """,
    re.VERBOSE | re.IGNORECASE,
)

_MEASURABLE_IMPACT = re.compile(
    r"""
    # "50%" or "50.5%"
    \b\d+(?:\.\d+)?\s*%
    |
    # "2× faster" / "10x improvement" / "3x reduction"
    \b\d+\s*[xX×]\s*(?:faster|better|cheaper|improvement|speedup|reduction|more\s+efficient)
    |
    # "reduced latency by" / "improved throughput" with a number nearby
    (?:reduced?|decreased?|improved?|increased?|optimized?|cut|saved?|boosted?)
        \s+\w+\s+(?:by\s+)?\d+
    |
    # dollar impact: "saved $2M" / "$2M saved" / "$500K cost reduction"
    (?:saved?|reduced?|eliminated?|cut)\s+\$\s*\d+
    | \$\s*\d+(?:\.\d+)?\s*[MKBmkb]?\s+(?:saved?|reduced?|in\s+cost|cost\s+reduction|savings?)
    |
    # "halved" / "doubled" / "tripled"
    \b(?:halved|doubled|tripled|quadrupled)\b
    """,
    re.VERBOSE | re.IGNORECASE,
)

_GITHUB_OSS = re.compile(
    r"""
    # GitHub or GitLab URL
    github\.com
    | gitlab\.com
    |
    # open-source mentions
    \bopen[- ]source\b
    | \bopen\s+sourced?\b
    | \bfoss\b
    """,
    re.VERBOSE | re.IGNORECASE,
)


class ComplexityAnalyzer:
    """
    Stateless analyzer.  Instantiate once as a module-level singleton.

    analyze() scans the project description + URL for complexity signals.
    """

    def analyze(
        self,
        description: str | None,
        url: str | None = None,
        name: str | None = None,
    ) -> ComplexitySignals:
        """
        Detect all four complexity signals in the project text.

        Combines description, URL, and name for maximum coverage.
        """
        combined = " ".join(filter(None, [name, description, url]))

        if not combined.strip():
            return ComplexitySignals()

        return ComplexitySignals(
            team_size=bool(_TEAM_SIZE.search(combined)),
            scale=bool(_SCALE.search(combined)),
            measurable_impact=bool(_MEASURABLE_IMPACT.search(combined)),
            github_or_oss=bool(_GITHUB_OSS.search(combined)),
        )
