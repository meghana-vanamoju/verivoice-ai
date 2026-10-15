"""Deterministic, explainable risk analysis for high-risk communications."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Literal


RiskLevel = Literal["low", "moderate", "high", "critical"]


@dataclass(frozen=True)
class _Rule:
    code: str
    title: str
    score: int
    patterns: tuple[str, ...]


@dataclass(frozen=True)
class RiskAssessment:
    score: int
    level: RiskLevel
    indicators: list[dict[str, object]]
    guidance: list[str]

    def to_dict(self) -> dict[str, object]:
        """Return a JSON-compatible assessment with a stable field layout."""
        return asdict(self)


_RULES = (
    _Rule(
        code="URGENCY",
        title="Urgent or pressured action",
        score=15,
        patterns=(
            r"\b(?:urgent(?:ly)?|immediately|right now|as soon as possible)\b",
            r"\b(?:act|do|send|pay)\s+(?:it\s+)?(?:now|today)\b",
            r"\b(?:don't|do not|cannot|can't)\s+wait\b",
            r"\bwithin\s+(?:the\s+)?(?:next\s+)?\d+\s+minutes?\b",
        ),
    ),
    _Rule(
        code="SECRECY",
        title="Request for secrecy",
        score=20,
        patterns=(
            r"\bkeep\s+(?:this|it)\s+(?:a\s+)?secret\b",
            r"\bdon't\s+tell\s+(?:anyone|anybody|the\s+\w+)\b",
            r"\bdo\s+not\s+tell\s+(?:anyone|anybody|the\s+\w+)\b",
            r"\bkeep\s+(?:this|it)\s+(?:confidential|between\s+us)\b",
            r"\b(?:in\s+)?strict\s+confidence\b",
        ),
    ),
    _Rule(
        code="CREDENTIAL_REQUEST",
        title="Request for credentials or authentication codes",
        score=30,
        patterns=(
            r"\b(?:share|send|tell|give|provide|read\s+(?:me\s+)?|"
            r"ask\s+for|request(?:ing)?(?:\s+for)?|need|want)\s+"
            r"(?:me\s+)?(?:your\s+)?(?:\w+\s+){0,2}"
            r"(?:password|passcode|pin|login\s+credentials?|"
            r"one[- ]time\s+code|verification\s+code|"
            r"authentication\s+code|security\s+code|recovery\s+code)\b",
            r"\bwhat(?:'s|\s+is)\s+(?:your\s+)?"
            r"(?:password|passcode|pin|one[- ]time\s+code|verification\s+code)\b",
        ),
    ),
    _Rule(
        code="MONEY_TRANSFER",
        title="Request to send or transfer money",
        score=30,
        patterns=(
            r"\b(?:wire|transfer|send|pay|remit)\s+"
            r"(?:the\s+)?(?:money|funds|payment|cash|amount|[$£€]?\s*\d)",
            r"\b(?:make|initiate)\s+(?:a\s+)?(?:bank\s+)?transfer\b",
            r"\b(?:bank|wire)\s+transfer\b",
            r"\b(?:buy|purchase|get)\s+(?:me\s+)?gift\s+cards?\b",
        ),
    ),
    _Rule(
        code="PAYMENT_DETAILS_CHANGED",
        title="Changed or new payment details",
        score=35,
        patterns=(
            r"\b(?:new|updated|changed|different|replacement)\s+"
            r"(?:bank|account|payment|wire|routing)\s+"
            r"(?:details?|information|instructions?|number|account)\b",
            r"\b(?:bank|account|payment|wire|routing)\s+"
            r"(?:details?|information|instructions?)\s+"
            r"(?:(?:have|has|were|was|are|is)\s+)?"
            r"(?:been\s+)?(?:changed|updated|modified|revised|different)\b",
            r"\buse\s+(?:this|the\s+new)\s+(?:account|bank|payment)\b",
            r"\bnew\s+account\s+number\b",
            r"\b(?:payment|bank|account|wire|routing|remittance)\s+"
            r"(?:details?|information|instructions?|info)\s+"
            r"(?:(?:have|has|were|was|are|is)\s+)?"
            r"(?:been\s+)?(?:changed|updated|modified|revised|different)\b",
        ),
    ),
)

_COMPILED_RULES = tuple(
    (rule, tuple(re.compile(pattern, re.IGNORECASE) for pattern in rule.patterns))
    for rule in _RULES
)

_NEGATION_PATTERN = re.compile(
    r"\b(?:do\s+not|don't|never(?:\s+to)?|not\s+to|should\s+not|shouldn't|"
    r"must\s+not|mustn't|cannot|can't|avoid|refrain\s+from)"
    r"(?:\s+\w+){0,6}\s*$",
    re.IGNORECASE,
)

_GENERAL_GUIDANCE = (
    "Verify the request through a known, independently sourced phone number or approved workflow before acting.",
)


def _risk_level(score: int) -> RiskLevel:
    if score >= 75:
        return "critical"
    if score >= 50:
        return "high"
    if score >= 25:
        return "moderate"
    return "low"


def _is_negated(text: str, start: int) -> bool:
    """Ignore a detected action when a nearby direct negation rejects it."""
    prefix = text[max(0, start - 60) : start]
    if re.search(r"\bnot\s+only(?:\s+\w+){0,6}\s*$", prefix, re.IGNORECASE):
        return False
    if re.search(r"[.!?;:]\s*\w*\s*$", prefix) and not prefix.rstrip().endswith((",",)):
        return False
    return _NEGATION_PATTERN.search(prefix) is not None


def analyze_texts(texts: tuple[str, ...]) -> RiskAssessment:
    """Analyze separate text sources without allowing matches across boundaries."""
    if not isinstance(texts, tuple) or any(not isinstance(text, str) for text in texts):
        raise TypeError("texts must be a tuple of strings")

    indicators: list[dict[str, object]] = []
    guidance: list[str] = []

    for rule, patterns in _COMPILED_RULES:
        evidence: list[str] = []
        for text in texts:
            matches: list[tuple[int, int, str]] = []
            for pattern in patterns:
                matches.extend(
                    (match.start(), match.end(), match.group(0))
                    for match in pattern.finditer(text)
                    if not _is_negated(text, match.start())
                )
            matches.sort(key=lambda match: (match[0], -(match[1] - match[0])))
            evidence_spans: list[tuple[int, int]] = []
            for start, end, snippet in matches:
                if any(
                    start >= seen_start and end <= seen_end
                    for seen_start, seen_end in evidence_spans
                ):
                    continue
                if snippet.casefold() not in {item.casefold() for item in evidence}:
                    evidence.append(snippet)
                    evidence_spans.append((start, end))

        if evidence:
            indicators.append(
                {
                    "code": rule.code,
                    "title": rule.title,
                    "evidence": evidence,
                    "score": rule.score,
                }
            )

    detected_codes = {indicator["code"] for indicator in indicators}
    if detected_codes & {"URGENCY", "SECRECY"}:
        guidance.append(
            "Pause and independently verify the request; do not let pressure or secrecy bypass normal checks."
        )
    if "CREDENTIAL_REQUEST" in detected_codes:
        guidance.append(
            "Never share passwords, PINs, or one-time codes; contact the organization using a trusted channel."
        )
    if detected_codes & {"MONEY_TRANSFER", "PAYMENT_DETAILS_CHANGED"}:
        guidance.append(
            "Do not transfer funds or use changed payment details until they are confirmed through a known contact and approved process."
        )
    if not guidance:
        guidance.extend(_GENERAL_GUIDANCE)
    elif len(guidance) > 1:
        guidance.append(_GENERAL_GUIDANCE[0])

    score = min(100, sum(int(indicator["score"]) for indicator in indicators))
    return RiskAssessment(
        score=score,
        level=_risk_level(score),
        indicators=indicators,
        guidance=guidance,
    )


def analyze_text(text: str) -> RiskAssessment:
    """Detect known social-engineering signals and aggregate a transparent score."""
    if not isinstance(text, str):
        raise TypeError("text must be a string")
    return analyze_texts((text,))


def analyze(text: str) -> dict[str, object]:
    """Return the assessment as a JSON-compatible dictionary."""
    return analyze_text(text).to_dict()
