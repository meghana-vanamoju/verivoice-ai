# VeriVoice AI
### Intelligent Voice Impersonation Defense System

VeriVoice AI is a prototype designed to help identify potential voice impersonation risks in high-risk communications. It combines audio-file validation, contextual risk analysis, and independent verification guidance instead of relying exclusively on deepfake classification.

## Problem

Voice cloning and identity impersonation can be used in fraudulent calls, financial scams, and unauthorized requests. A familiar-sounding voice alone is not sufficient proof of identity.

## Proposed Solution

VeriVoice AI will provide:

- **Audio validation:** Inspect supported audio files for basic technical anomalies.
- **Contextual risk analysis:** Identify suspicious patterns such as urgency, secrecy, requests for credentials, money transfers, and changed payment details.
- **Risk assessment:** Present transparent indicators and a preliminary risk level.
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

Setup and execution instructions will be added as the backend and frontend implementations are introduced.

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