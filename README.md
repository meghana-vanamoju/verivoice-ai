# VeriVoice AI
### Intelligent Voice Impersonation Defense System

VeriVoice AI is a prototype designed to help identify potential voice impersonation risks in high-risk communications. It combines audio-file validation, contextual risk analysis, and independent verification guidance instead of relying exclusively on deepfake classification.

## Problem

Voice cloning and identity impersonation can be used in fraudulent calls, financial scams, and unauthorized requests. A familiar-sounding voice alone is not sufficient proof of identity.

## Proposed Solution

VeriVoice AI will provide:

- **Audio validation:** Inspect supported audio files (WAV, MP3, MP4) for basic technical anomalies.
- **Contextual risk analysis:** Identify suspicious patterns such as urgency, secrecy, requests for credentials, money transfers, and changed payment details.
- **Risk assessment:** Present transparent indicators and a preliminary risk level.
- **Rules and aggregation:** Detect urgency, secrecy, credential requests, money transfers, and changed payment details with stable codes, evidence, weighted scores, and guidance.
- **Verification guidance:** Recommend confirming sensitive requests through a known phone number or an approved organizational workflow.
- **Explainable results:** Show the reasons behind each warning.

## Technology Stack

- Frontend: React, TypeScript, Vite
- Backend: Python, FastAPI
- API: REST
- Testing: Pytest and frontend testing tools
- Version control: Git and GitHub

## Project Structure

```text
backend/       FastAPI backend and tests
frontend/      React frontend
docs/          Architecture and API documentation
demo-data/     Synthetic demo resources only
```

## Current Prototype Scope

The initial prototype will focus on audio validation and transparent context-based risk indicators. These checks do **not** establish whether a voice is genuine or cloned, and the risk score is not a calibrated probability of fraud.

A production-ready deepfake detector would require a separately evaluated detection model and representative test data.

## Running the Project

### System Dependencies

VeriVoice AI requires **FFmpeg** for MP3 and MP4 file processing. WAV files work
without FFmpeg, but MP3 and MP4 support requires the `ffmpeg` and `ffprobe`
binaries to be installed on your system.

**Install FFmpeg:**

- **Ubuntu/Debian:** `sudo apt-get install ffmpeg`
- **macOS:** `brew install ffmpeg`
- **Windows:** Download from https://ffmpeg.org/download.html or use `winget install ffmpeg`

Verify installation: `ffmpeg -version` and `ffprobe -version`

### Python Dependencies

Run the backend from the repository root:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn app.main:app --app-dir backend --reload
```

In another terminal, start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`). The frontend sends context
and an optional transcript to `POST /api/v1/context/analyze`. For a frontend
served from a different origin, set `VITE_API_BASE_URL` to the backend origin
and configure `VERIVOICE_CORS_ORIGINS` on the backend as a comma-separated list
of trusted origins.

Run the backend tests from `backend/` with:

```bash
python -m pytest tests
```

Run frontend tests from `frontend/` with `npm test`.

The context-risk service contract and scoring rules are documented in [docs/api/risk-analysis.md](docs/api/risk-analysis.md).

## Security and Privacy

- Never commit API keys, credentials, or `.env` files.
- Use synthetic demo scenarios.
- Avoid uploading or storing real voice recordings without appropriate authorization and safeguards.
- Independently verify high-risk requests before taking action.

## Team
Vanamoju Lakshmi Meghana
Kothakapu Akshaya
Samala Saharsha
Ramireddy Nitheesha