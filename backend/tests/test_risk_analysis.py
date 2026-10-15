import pytest

from app.services.risk_analysis import analyze, analyze_text


def test_no_signals_returns_low_risk_and_general_guidance():
    result = analyze("The team meeting is scheduled for next Tuesday.")

    assert result == {
        "score": 0,
        "level": "low",
        "indicators": [],
        "guidance": [
            "Verify the request through a known, independently sourced phone number or approved workflow before acting."
        ],
    }


def test_mentioning_credentials_without_a_request_is_not_flagged():
    result = analyze("The security policy discusses passwords and verification codes.")

    assert result["score"] == 0
    assert result["indicators"] == []


@pytest.mark.parametrize(
    "text",
    [
        "Do not wire the funds.",
        "Never transfer the money.",
        "Do not send the payment today.",
    ],
)
def test_negated_transfer_is_not_flagged(text):
    result = analyze(text)

    assert result["score"] == 0
    assert result["indicators"] == []


@pytest.mark.parametrize(
    ("text", "expected_codes"),
    [
        (
            "Don't forget to wire the funds immediately.",
            ["URGENCY", "MONEY_TRANSFER"],
        ),
        (
            "Do not hesitate to send the money today.",
            ["MONEY_TRANSFER"],
        ),
    ],
)
def test_affirmative_negation_idioms_keep_transfer_findings(text, expected_codes):
    result = analyze(text)

    assert [indicator["code"] for indicator in result["indicators"]] == expected_codes
    assert result["score"] >= 30
    assert result["level"] != "low"


def test_direct_negation_after_affirmative_idiom_still_suppresses_action():
    result = analyze(
        "Don't forget to wire the funds, but do not share your password."
    )

    assert [indicator["code"] for indicator in result["indicators"]] == [
        "MONEY_TRANSFER"
    ]


@pytest.mark.parametrize(
    "text",
    [
        "Never share your password.",
        "Do not tell me your verification code.",
        "You should not provide your PIN.",
    ],
)
def test_negated_credential_request_is_not_flagged(text):
    result = analyze(text)

    assert result["score"] == 0
    assert result["indicators"] == []


def test_not_only_does_not_negate_a_request():
    result = analyze("Not only send the funds, but wire the payment today.")

    assert result["score"] == 30
    assert result["indicators"][0]["code"] == "MONEY_TRANSFER"


@pytest.mark.parametrize(
    "text",
    [
        "The invoice payment details have been changed.",
        "Our bank information has changed.",
        "The account instructions were updated.",
        "Payment info is different now.",
    ],
)
def test_common_changed_payment_detail_phrases_are_detected(text):
    result = analyze(text)

    assert any(
        indicator["code"] == "PAYMENT_DETAILS_CHANGED"
        for indicator in result["indicators"]
    )


@pytest.mark.parametrize(
    ("text", "code", "expected_evidence", "expected_score"),
    [
        ("Please act immediately.", "URGENCY", ["immediately"], 15),
        ("Keep this confidential.", "SECRECY", ["Keep this confidential"], 20),
        (
            "Tell me your password.",
            "CREDENTIAL_REQUEST",
            ["Tell me your password"],
            30,
        ),
        ("Wire the money today.", "MONEY_TRANSFER", ["Wire the money"], 30),
        (
            "Use the new account.",
            "PAYMENT_DETAILS_CHANGED",
            ["Use the new account"],
            35,
        ),
    ],
)
def test_each_rule_returns_stable_code_evidence_and_score(
    text, code, expected_evidence, expected_score
):
    result = analyze(text)

    assert result["score"] == expected_score
    expected_level = "low" if expected_score < 25 else "moderate"
    assert result["level"] == expected_level
    assert result["indicators"][0]["code"] == code
    assert result["indicators"][0]["evidence"] == expected_evidence
    assert result["indicators"][0]["score"] == expected_score


def test_multiple_rules_aggregate_and_cap_score_with_actionable_guidance():
    result = analyze(
        "Urgent, send the funds immediately. Keep this secret. Tell me your "
        "password and verification code. Use the new account."
    )

    assert [item["code"] for item in result["indicators"]] == [
        "URGENCY",
        "SECRECY",
        "CREDENTIAL_REQUEST",
        "MONEY_TRANSFER",
        "PAYMENT_DETAILS_CHANGED",
    ]
    assert result["score"] == 100
    assert result["level"] == "critical"
    assert len(result["guidance"]) == 4
    assert all(result["guidance"])


def test_score_bands_use_distinct_rule_weights():
    assert analyze_text("Act now.").level == "low"
    assert analyze_text("Keep this secret.").level == "low"
    assert analyze_text("Tell me your password.").level == "moderate"
    assert analyze_text("Tell me your password; wire the funds.").level == "high"
    assert analyze_text("Transfer money and use the new account.").level == "high"
    assert analyze_text(
        "Tell me your password, wire the money, and use the new account."
    ).level == "critical"


def test_evidence_is_case_insensitive_and_deduplicated():
    result = analyze("URGENT: urgent, please act NOW.")
    urgency = result["indicators"][0]

    assert urgency["code"] == "URGENCY"
    assert urgency["evidence"] == ["URGENT", "act NOW"]


def test_non_string_input_is_rejected():
    with pytest.raises(TypeError, match="text must be a string"):
        analyze_text(None)
