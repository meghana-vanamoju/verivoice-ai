# VeriVoice AI API Contract

## Overview

This document defines the API contract for the VeriVoice AI voice impersonation defense prototype. The system combines audio-file validation, contextual risk analysis, and independent verification guidance — **without** claiming that audio metadata or contextual heuristics prove a voice is genuine or cloned.

> **Important:** Until a real deepfake detector has been integrated and evaluated, all detector fields return `not_configured` with `score: null` and `label: "unknown"`. Detector failure or unavailability must never be presented as proof that the voice is genuine.

---

## Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check endpoint. Returns the service status. |
| `POST` | `/api/v1/analyze` | Accepts an audio file and communication context, validates the audio, analyzes contextual warning indicators, and returns structured risk findings and verification guidance. |

Both endpoints use `application/json` for request/response bodies. The analysis endpoint uses `multipart/form-data`.

---

## Request

### `POST /api/v1/analyze`

Multipart form fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `audio` | file | **Yes** | Uploaded audio file. Initially only valid WAV files are supported. The actual file contents are validated, **not** just the filename or declared MIME type. |
| `context` | text | **Yes** | Non-empty string describing the communication scenario (e.g., "urgent money request from supposed CEO"). |
| `transcript` | text | No | Optional transcript of the audio content. |
| `language` | text | No | Optional language code (e.g., `"en-US"`, `"es-ES"`). |

### Sample request (cURL)

```bash
curl -X POST "http://localhost:8000/api/v1/analyze" \
  -F "audio=@sample.wav" \
  -F "context=Urgent request from supposed CEO to transfer funds to a new vendor." \
  -F "transcript='Transfer the money now.'" \
  -F "language=en-US"
```

---

## Limits

- **Maximum upload size:** 15 MB (configured via `MAX_AUDIO_SIZE_MB=15`).
- **Maximum audio duration:** 120 seconds (configured via `MAX_AUDIO_DURATION_SECONDS=120`).
- Audio must be a valid WAV file — validation is performed on actual file contents (file header/format), not just the extension or declared MIME type.

### Error codes for request validation

| Situation | HTTP Status | Code (in error response) |
|---|---|---|
| Missing required field `audio` or `context` | 422 | `missing_field` |
| Unsupported audio format (not WAV) | 415 | `unsupported_format` |
| Audio file is malformed or cannot be read | 400 | `malformed_audio` |
| Upload exceeds 15 MB | 413 | `limit_exceeded` |
| Audio duration exceeds 120 seconds | 413 | `limit_exceeded` |
| Invalid/empty `context` string | 422 | `missing_field` |

---

## Success Response

### HTTP 200

```json
{
  "analysis_id": "c5f8e2d1-3a7b-4e8c-9f1a-2b6d5e7f8a9c",
  "status": "completed",
  "risk": {
    "score": 72,
    "level": "high",
    "basis": "contextual_indicators + technical_anomalies",
    "summary": "High-risk indicators detected: urgency, money transfer request, and changed payment details."
  },
  "audio": {
    "valid": true,
    "format": "WAV",
    "duration_sec": 58.3,
    "sample_rate_hz": 44100,
    "channel_count": 2,
    "warnings": [
      "audio_duration_near_limit"
    ],
    "deepfake_detection": {
      "status": "not_configured",
      "score": null,
      "label": "unknown"
    }
  },
  "findings": [
    {
      "code": "urgent_action",
      "category": "behavioral",
      "severity": "high",
      "title": "Urgent action requested",
      "evidence": "The caller pressures the recipient to act immediately without verification.",
      "source": "contextual_analysis",
      "confidence": 0.87
    },
    {
      "code": "money_transfer",
      "category": "financial",
      "severity": "high",
      "title": "Money transfer requested",
      "evidence": "The communication requests a transfer of funds to a new or unverified recipient.",
      "source": "contextual_analysis",
      "confidence": 0.91
    }
  ],
  "verification_guidance": {
    "code": "independent_contact",
    "priority": "high",
    "message": "Independently contact the supposed sender through a known, trusted phone number or channel. Do not use contact details provided in the suspicious communication."
  },
  "limitations": [
    "Audio validation confirms technical validity only; it does not verify speaker authenticity.",
    "Contextual indicators are heuristic warnings, not proof of impersonation or fraud.",
    "No deepfake detector is currently configured; results should not be interpreted as detector output.",
    "Risk score is a heuristic indicator and not a calibrated probability of fraud."
  ]
}
```

### Field descriptions

| Field | Type | Description |
|---|---|---|
| `analysis_id` | `uuid` string | Unique identifier for this analysis session. |
| `status` | `string` | `"completed"` or `"failed"`. |
| `risk.score` | `integer` (0–100) | Heuristic warning indicator. **Not** a calibrated fraud probability. |
| `risk.level` | `string` | `"low"` (0–33), `"medium"` (34–66), `"high"` (67–100). |
| `risk.basis` | `string` | Summary of the basis for the risk assessment. |
| `risk.summary` | `string` | Human-readable summary. |
| `audio.valid` | `boolean` | Technical audio validation succeeded. Does **not** mean the speaker is authentic. |
| `audio.format` | `string` | Detected format (e.g., `"WAV"`). |
| `audio.duration_sec` | `number` | Measured duration in seconds. |
| `audio.sample_rate_hz` | `integer` | Sample rate in Hz. |
| `audio.channel_count` | `integer` | Number of audio channels. |
| `audio.warnings` | `string[]` | List of technical warnings (e.g., `"audio_duration_near_limit"`). |
| `audio.deepfake_detection.status` | `string` | One of: `not_configured`, `completed`, `failed`. |
| `audio.deepfake_detection.score` | `number` or `null` | Detector score if available; `null` when not configured/available. |
| `audio.deepfake_detection.label` | `string` or `null` | Detector label if available; `null` when not configured/available. |
| `findings[].code` | `string` | Stable finding code (e.g., `urgent_action`, `money_transfer`, `credential_request`, `secrecy`, `changed_details`, `identity_uncertainty`). |
| `findings[].category` | `string` | Category of the finding (e.g., `"behavioral"`, `"financial"`, `"identity"`). |
| `findings[].severity` | `string` | `"low"`, `"medium"`, `"high"`. |
| `findings[].title` | `string` | Human-readable title. |
| `findings[].evidence` | `string` | Description of the evidence supporting this finding. |
| `findings[].source` | `string` | `"contextual_analysis"` or `"technical_validation"`. |
| `findings[].confidence` | `number` or `null` | Confidence score 0–1, or `null` if not applicable. |
| `verification_guidance.code` | `string` | Action code (e.g., `independent_contact`). |
| `verification_guidance.priority` | `string` | `"low"`, `"medium"`, `"high"`. |
| `verification_guidance.message` | `string` | Human-readable guidance message. |
| `limitations[]` | `string` | Explicit limitations of the system. |

### Detector status values

| Status | Meaning |
|---|---|
| `not_configured` | No deepfake detector has been integrated or evaluated. Return with `score: null`, `label: "unknown"`. |
| `completed` | A detector ran successfully. Include its `score` and `label`. |
| `failed` | The detector encountered an error. Return `score: null`, `label: "unknown"`, and document the failure in `limitations`. |

> **Until a real detector is integrated:** Always return `not_configured`, `score: null`, `label: "unknown"`. Never infer genuineness from the absence of detector output.

---

## Error Response

### HTTP 400, 413, 415, 422, 500

```json
{
  "error": {
    "code": "missing_field",
    "message": "Required field 'audio' is missing or empty.",
    "details": null
  }
}
```

| HTTP Status | When Used |
|---|---|
| 400 | Malformed audio file, invalid data, or unexpected condition. |
| 413 | Upload exceeds 15 MB or audio duration exceeds 120 seconds. |
| 415 | Unsupported media type (file is not WAV). |
| 422 | Validation error (missing required fields, empty context, etc.). |
| 500 | Unexpected server error. |

Error response fields:

| Field | Type | Description |
|---|---|---|
| `error.code` | `string` | Machine-readable error code (see table above). |
| `error.message` | `string` | Human-readable explanation. |
| `error.details` | `any` or `null` | Optional additional detail; always `null` in the baseline contract. |

---

## Risk Semantics (Agreed Conventions)

- The **risk score** is a **heuristic warning indicator**, **not** a calibrated probability of fraud.
- **Contextual indicators** are not proof of impersonation or cloning.
- `audio.valid` means **technical audio validation succeeded**; it does **not** mean the speaker is authentic.
- **Finding codes** and **severity thresholds** are defined in this contract so all team modules use the same semantics.
- The `risk.level` mapping:
  - `low`: score 0–33
  - `medium`: score 34–66
  - `high`: score 67–100

---

## Sample Request / Response

### Request (multipart/form-data)

- `audio`: WAV file, ~58 seconds, 44.1 kHz, stereo
- `context`: "Urgent request from supposed CEO to transfer funds to a new vendor."
- `transcript` (optional): `"Transfer the money now."`
- `language` (optional): `"en-US"`

### Response (abbreviated)

```json
{
  "analysis_id": "c5f8e2d1-3a7b-4e8c-9f1a-2b6d5e7f8a9c",
  "status": "completed",
  "risk": {
    "score": 72,
    "level": "high",
    "basis": "contextual_indicators + technical_anomalies",
    "summary": "High-risk indicators detected: urgency, money transfer request, and changed payment details."
  },
  "audio": {
    "valid": true,
    "format": "WAV",
    "duration_sec": 58.3,
    "sample_rate_hz": 44100,
    "channel_count": 2,
    "warnings": ["audio_duration_near_limit"],
    "deepfake_detection": {
      "status": "not_configured",
      "score": null,
      "label": "unknown"
    }
  },
  "findings": [
    {
      "code": "urgent_action",
      "category": "behavioral",
      "severity": "high",
      "title": "Urgent action requested",
      "evidence": "The caller pressures the recipient to act immediately without verification.",
      "source": "contextual_analysis",
      "confidence": 0.87
    },
    {
      "code": "money_transfer",
      "category": "financial",
      "severity": "high",
      "title": "Money transfer requested",
      "evidence": "The communication requests a transfer of funds to a new or unverified recipient.",
      "source": "contextual_analysis",
      "confidence": 0.91
    }
  ],
  "verification_guidance": {
    "code": "independent_contact",
    "priority": "high",
    "message": "Independently contact the supposed sender through a known, trusted phone number or channel. Do not use contact details provided in the suspicious communication."
  },
  "limitations": [
    "Audio validation confirms technical validity only; it does not verify speaker authenticity.",
    "Contextual indicators are heuristic warnings, not proof of impersonation or fraud.",
    "No deepfake detector is currently configured; results should not be interpreted as detector output.",
    "Risk score is a heuristic indicator and not a calibrated probability of fraud."
  ]
}
```

---

## Example Finding Codes

| Code | Category | Typical Severity | Description |
|---|---|---|---|
| `urgent_action` | behavioral | high | Caller pressures recipient to act immediately without verification. |
| `money_transfer` | financial | high | Request to transfer funds to a new or unverified recipient. |
| `credential_request` | identity | high | Request for usernames, passwords, or OTPs. |
| `secrecy` | behavioral | medium | Instruction to keep the request secret or not tell anyone. |
| `changed_details` | financial | medium | Notification that payment details or banking information have changed. |
| `identity_uncertainty` | identity | medium | Unable to confirm the claimed identity with confidence. |

---

## Verification Guidance (Recommended Pattern)

- **Code:** `independent_contact`
- **Priority:** `high` (escalate when financial or credential data is involved)
- **Message:** `"Independently contact the supposed sender through a known, trusted phone number or channel. Do not use contact details provided in the suspicious communication."`

Additional guidance codes may include `consult_organization_policy`, `confirm_via_secondary_channel`, and `report_to_it_security` depending on the organizational context.