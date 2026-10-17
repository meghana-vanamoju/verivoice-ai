# Audio Validation Module (Nitheesha)

Audio validation + basic quality analysis for VeriVoice AI (WAV, MP3, MP4).
WAV files are validated using the Python standard library (`wave`, `struct`, `io`).
MP3 and MP4 files require FFmpeg for decoding/extraction. Uses `pydantic`
for schemas.

## Usage

```python
from app.services.audio_validation import validate_audio, analyze_audio_file

result = validate_audio(audio_bytes)
# {
#   "valid": True, "format": "WAV", "duration_seconds": 5.0,
#   "sample_rate_hz": 8000, "channels": 1, "validation_warnings": [...],
#   "deepfake_detection": {"status": "not_configured", "score": None, "label": "unknown"},
# }

result, error = analyze_audio_file(file_bytes, filename)
# Success: (AudioValidationResult, None); failure: (None, {"error": {...}, "status": int})
```

`validate_audio` never raises on invalid input — rejected files return
`valid=False` with a machine-readable entry in `validation_warnings`.
`analyze_audio_file` maps failures to the API contract's HTTP codes
(missing_field/422, malformed_audio/400, limit_exceeded/413) with generic
messages that never expose internal exceptions or stack traces.

## Validation rules

- Content-based: parsed with `wave.open` on actual bytes; filename/MIME ignored.
- Empty input (`b""`, wrong type) rejected: `empty_file` / `invalid_input_type`.
- Unreadable/truncated/corrupted/unsupported data rejected: `malformed_audio`.
- Files with zero audio frames rejected: `empty_audio_data`.
- Size limit: 15 MB (`MAX_AUDIO_SIZE_BYTES`); over → `file_size_exceeds_limit` / 413.
- Duration limit: 120 s (`MAX_AUDIO_DURATION_SECONDS`); over → `audio_duration_exceeds_limit` / 413.
- No restrictions on sample rate / channel count (unusual values accepted).

## Output fields (`validate_audio`)

| Field | Meaning |
|---|---|
| `valid` | Technical validity only — **not** speaker authenticity. |
| `format` | `"WAV"`, `"MP3"`, or `"MP4"` on success, `"unknown"` on rejection. |
| `duration_seconds` | Rounded to 3 decimals; `0.0` on rejection. |
| `sample_rate_hz` / `channels` | From WAV header; `0` on rejection. |
| `validation_warnings` | Non-fatal notes + rejection reason codes. |
| `deepfake_detection` | `not_configured`/`None`/`unknown` by default; `completed` with score+label when the opt-in detector runs (see below). |

Warnings: `audio_duration_near_limit` (≥115 s), `very_short_audio` (<0.5 s),
`possible_clipping_detected` (peak ≥99% full scale; 8/16-bit PCM only),
`silent_or_very_quiet_audio` (peak <1% full scale).

## Test commands

```bash
cd backend
python3 -m pytest tests/test_audio_validation.py tests/test_deepfake_detector.py -q
python3 -m pytest tests/ -q
```

Real-weight integration (opt-in, skipped by default):

```bash
VERIVOICE_DETECTOR_MODEL=/path/to/downloaded/checkpoint \
  python3 -m pytest tests/test_deepfake_detector.py::test_real_pretrained_weights_integration -q
```

## Detector status meanings

| Status | Meaning |
|---|---|
| `not_configured` | No detector configured (default). `score: null`, `label: "unknown"`. Validation works normally. |
| `completed` | Configured detector ran successfully on validated audio. `score` 0–100, `label` `"bonafide"`/`"spoof"`. |
| `failed` | Configured detector errored or returned an invalid result. `score: null`, `label: "unknown"`. Validation result is unaffected. |

## Deepfake detector (opt-in HF wav2vec2 integration)

Selected and verified checkpoint:

- **Checkpoint ID:** `mo-thecreator/Deepfake-audio-detection`
- **Model card:** <https://huggingface.co/mo-thecreator/Deepfake-audio-detection>
- **License:** Apache-2.0 (confirmed via Hub API tag `license:apache-2.0` and
  card metadata). Permissive; suitable for public ideathon demonstration.
  No additional model-card usage restrictions were found (the card's
  intended-uses/evaluation sections are marked "More information needed").
- **Architecture:** `Wav2Vec2ForSequenceClassification` (wav2vec2-base,
  ~94.6M params, `model.safetensors` ~360 MB), loaded via `transformers`
  `AutoModelForAudioClassification` + `AutoFeatureExtractor`.
- **Label mapping (verified from downloaded `config.json`):**
  `{0: "fake", 1: "real"}` — spoof class is **index 0**. The detector resolves
  this dynamically from the model config (substring match on
  `fake`/`spoof`/`synthetic`/`generated`), so the reversed order used by some
  other checkpoints would also resolve correctly.
- **Preprocessing (verified from `preprocessor_config.json`):** 16 kHz,
  `do_normalize: true`, `Wav2Vec2FeatureExtractor`. Our pipeline matches:
  header-based WAV decode → mono mix-down → linear-interpolation resample to
  16 kHz → first 10 s crop (`MAX_DETECTOR_SECONDS`) → HF feature extractor
  (which applies its documented normalization) → softmax over logits.
- **Evaluation metrics:** none published on the model card — treat all scores
  as uncalibrated demo indicators (see below).

### Download and configure (operator steps)

Weights live **outside** the repo and are never downloaded at startup:

```bash
mkdir -p ~/models/verivoice-deepfake-audio
hf download mo-thecreator/Deepfake-audio-detection \
  --local-dir ~/models/verivoice-deepfake-audio
```

Verify the download contains `config.json`, `preprocessor_config.json`,
`model.safetensors`, and that `config.json` shows
`id2label: {"0": "fake", "1": "real"}` before use.

Point the service at the checkpoint (no hardcoded paths in source):

```bash
export VERIVOICE_DETECTOR_MODEL="$HOME/models/verivoice-deepfake-audio"
```

Or in Python: `configure_hf_detector("/path/to/checkpoint")`.
Unset the variable / call `clear_detector()` to run validation only.

### Optional dependency installation

Detector deps are optional and installed separately from the base backend:

```bash
pip install "torch>=2.11" "transformers>=5.5"
```

Verified working: torch 2.11.0 (CPU), transformers 5.14.1. Without them,
inference returns `failed` while WAV validation keeps working. No
scipy/librosa/torchaudio needed (mono mix-down + linear resample are
stdlib-only).

### Score semantics and threshold

- Score = softmax probability of the verified `"fake"` class (index 0) × 100:
  an **uncalibrated spoof-likelihood 0–100, not a calibrated probability and
  not proof of authenticity**.
- Label `"spoof"` when score ≥ 50, else `"bonafide"`. The threshold of 50 is a
  **demo heuristic, not a validated security boundary**.
- NaN, infinity, out-of-range, unknown labels, missing classes, exceptions,
  and undecodable PCM widths all yield `failed`/`null`/`"unknown"` — never a
  fabricated result. A `"bonafide"` label must never be presented as proof
  that a voice is genuine.

### Running with and without the detector

- Validation only (default): unset `VERIVOICE_DETECTOR_MODEL`; valid files
  return `deepfake_detection: {status: not_configured, score: null, ...}`.
- With detector: export the variable as above. First inference takes a few
  extra seconds for model load (~6 s observed on CPU here); later calls reuse
  the loaded model. Safety: weights load via `transformers` from local
  `model.safetensors`; arbitrary `torch.load` of untrusted pickles is never
  used. The detector runs only after audio passes validation.

### Troubleshooting

| Symptom | Meaning / fix |
|---|---|
| `not_configured` | No checkpoint configured — set `VERIVOICE_DETECTOR_MODEL` or call `configure_hf_detector()`. |
| `failed` on valid audio | Missing torch/transformers, bad checkpoint path, or undecodable PCM width — validation result is unaffected. |
| Slow first inference | One-time load of ~360 MB weights into RAM; subsequent calls are faster. |
| `failed` after swapping checkpoints | Re-verify the new `config.json` label mapping before trusting labels. |

## Limitations

- WAV validation and quality warnings **cannot establish whether a voice is
  genuine or AI-generated**. A technically valid file may still be cloned;
  a low-quality file may still be genuine.
- Clipping/silence heuristics are basic peak checks on a bounded frame sample,
  supported only for 8/16-bit PCM; 24/32-bit files skip peak analysis silently.
- The detector is opt-in and unevaluated on our data: never interpret
  `valid=True`, a low spoof score, or a `"bonafide"` label as proof of
  authenticity. The model card publishes no evaluation metrics, and spoof
  detectors generalize poorly to unseen synthesis methods, codecs, and noise.

## Deepfake detector background and rejected alternatives

Earlier investigation found typical voice-spoof detectors weigh 100 MB–1 GB+,
may need GPU for comfortable latency, and can carry research/non-commercial
licenses with poor out-of-corpus generalization. The selected checkpoint
(`mo-thecreator/Deepfake-audio-detection`, Apache-2.0, ~360 MB, CPU-tested
above) avoids the licensing concern; accuracy on unseen attacks remains
unmeasured and must be evaluated with representative demo data (measuring
false-accept/false-reject rates) before any demo treats labels as meaningful.
Rejected alternative: official AASIST (MIT, tiny weights, EER 0.83% on
ASVspoof19 LA) — fastest on CPU but requires vendoring custom
graph-attention code and manual weight placement; kept as a future option.
