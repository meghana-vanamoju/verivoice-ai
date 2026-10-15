import pytest

from backend.app.services.context_service import analyze_context


def test_context_analysis_returns_findings_score_level_and_guidance():
    result = analyze_context(
        "The caller says this is urgent; keep this confidential."
    )

    assert list(result) == ["findings", "score", "level", "guidance"]
    assert [finding["code"] for finding in result["findings"]] == [
        "URGENCY",
        "SECRECY",
    ]
    assert result["score"] == 35
    assert result["level"] == "moderate"
    assert result["guidance"]
    assert result["findings"][0]["evidence"] == ["urgent"]


def test_transcript_is_analyzed_and_evidence_is_merged_by_rule():
    result = analyze_context(
        "The caller claims to be the CFO.",
        "Please wire the funds immediately.",
    )

    assert [finding["code"] for finding in result["findings"]] == [
        "URGENCY",
        "MONEY_TRANSFER",
    ]
    assert result["score"] == 45
    assert result["level"] == "moderate"
    urgency = result["findings"][0]
    assert urgency["evidence"] == ["immediately"]
    assert "wire the funds" in result["findings"][1]["evidence"][0].lower()


def test_patterns_do_not_match_across_context_and_transcript_boundary():
    result = analyze_context("Please send", "the money later.")

    assert result["findings"] == []
    assert result["score"] == 0


def test_same_signal_in_context_and_transcript_only_adds_weight_once():
    result = analyze_context("This is urgent.", "Please act immediately.")

    assert result["score"] == 15
    assert [finding["code"] for finding in result["findings"]] == ["URGENCY"]
    assert result["findings"][0]["evidence"] == ["urgent", "immediately"]


@pytest.mark.parametrize(
    ("context", "transcript", "message"),
    [
        (None, None, "context must be a string"),
        ("Context", 4, "transcript must be a string or None"),
    ],
)
def test_invalid_input_is_rejected(context, transcript, message):
    with pytest.raises(TypeError, match=message):
        analyze_context(context, transcript)
