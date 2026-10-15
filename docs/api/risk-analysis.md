# Context risk analysis

`backend.app.services.context_service.analyze_context(context, transcript=None)`
provides deterministic, explainable screening for five social-engineering
signals. It analyzes context and transcript as separate sources and returns a
JSON-compatible result with this stable shape:

`POST /api/v1/context/analyze` accepts the same inputs:

```json
{
  "context": "A supplier called about an invoice.",
  "transcript": "Please wire the funds immediately to our new account; the payment details have been changed."
}
```

```json
{
  "score": 80,
  "level": "critical",
  "findings": [
    {
      "code": "URGENCY",
      "title": "Urgent or pressured action",
      "evidence": ["immediately"],
      "score": 15
    },
    {
      "code": "MONEY_TRANSFER",
      "title": "Request to send or transfer money",
      "evidence": ["wire the funds"],
      "score": 30
    },
    {
      "code": "PAYMENT_DETAILS_CHANGED",
      "title": "Changed or new payment details",
      "evidence": ["payment details have been changed"],
      "score": 35
    }
  ],
  "guidance": [
    "Pause and independently verify the request; do not let pressure or secrecy bypass normal checks.",
    "Do not transfer funds or use changed payment details until they are confirmed through a known contact and approved process.",
    "Verify the request through a known, independently sourced phone number or approved workflow before acting."
  ]
}
```

The service can also be used directly from Python:

```python
from app.services.context_service import analyze_context

result = analyze_context("A supplier called about an invoice.", "Wire the funds now.")
```

Stable indicator codes and their weights are:

| Code | Signal | Weight |
| --- | --- | ---: |
| `URGENCY` | Urgent or pressured action | 15 |
| `SECRECY` | Request for secrecy | 20 |
| `CREDENTIAL_REQUEST` | Credentials or authentication codes | 30 |
| `MONEY_TRANSFER` | Request to send or transfer money | 30 |
| `PAYMENT_DETAILS_CHANGED` | Changed or new payment details | 35 |

Each detected category contributes its weight once across both inputs,
regardless of how many matching phrases appear. The aggregate is capped at 100.
Evidence snippets are drawn from either source and combined by finding code.
Levels are `low` (0–24), `moderate` (25–49), `high` (50–74), and `critical`
(75–100). Guidance is selected from the detected categories and always
recommends independent verification.

Directly negated actions such as “do not wire the funds” and “never share your
password” are excluded from findings. Negation handling is a local heuristic;
complex or ambiguous language still requires human judgment.

This is a transparent heuristic, not a calibrated probability or proof of
fraud or voice impersonation. No listed signal being detected does not establish
that a request is safe.
