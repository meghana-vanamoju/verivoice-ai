"""Contextual risk-analysis service."""

from .risk_analysis import analyze_texts


def analyze_context(
    context: str,
    transcript: str | None = None,
) -> dict[str, object]:
    """Return contextual findings, heuristic score, level, and guidance."""
    if not isinstance(context, str):
        raise TypeError("context must be a string")
    if transcript is not None and not isinstance(transcript, str):
        raise TypeError("transcript must be a string or None")

    sources = (context,) if transcript is None else (context, transcript)
    assessment = analyze_texts(sources).to_dict()
    return {
        "findings": assessment["indicators"],
        "score": assessment["score"],
        "level": assessment["level"],
        "guidance": assessment["guidance"],
    }
