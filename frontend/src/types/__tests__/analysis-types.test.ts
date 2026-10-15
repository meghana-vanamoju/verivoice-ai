import { describe, it, expect } from "vitest";
import type { AnalysisResponse, AudioValidation, DeepfakeDetection, Finding } from "../analysis";
import { isAnalysisResponse } from "../analysis";

const deepfakeNotConfigured: DeepfakeDetection = {
  status: "not_configured",
  score: null,
  label: "unknown",
};

const deepfakeCompleted: DeepfakeDetection = {
  status: "completed",
  score: 0.85,
  label: "unknown",
};

const findingExample: Finding = {
  code: "urgent_action",
  category: "contextual",
  severity: "high",
  title: "Urgent action requested",
  evidence: "The transcript mentions urgency.",
  source: "contextual_heuristic",
  confidence: 0.92,
};

const findingWithNullConfidence: Finding = {
  code: "identity_uncertainty",
  category: "contextual",
  severity: "medium",
  title: "Identity uncertain",
  evidence: "No matching voice profile found.",
  source: "contextual_heuristic",
  confidence: null,
};

const validAudio: AudioValidation = {
  valid: true,
  format: "wav",
  duration_seconds: 45.2,
  sample_rate_hz: 16000,
  channels: 1,
  validation_warnings: [],
  deepfake_detection: deepfakeNotConfigured,
};

const validResponse: AnalysisResponse = {
  analysis_id: "test-12345",
  status: "completed",
  risk: {
    score: 67,
    level: "medium",
    basis: "contextual_heuristic",
    summary: "Moderate risk based on contextual patterns.",
  },
  audio: validAudio,
  findings: [findingExample],
  verification_guidance: [
    { code: "urgent_action", priority: "high", message: "Confirm through known channel." },
  ],
  limitations: [
    "Contextual warning patterns do not prove that a voice is cloned.",
  ],
};

describe("Analysis type validation", () => {
  it("validates a complete analysis response", () => {
    expect(isAnalysisResponse(validResponse)).toBe(true);
  });

  it("rejects responses missing required fields", () => {
    const bad = { ...validResponse, analysis_id: "" };
    expect(isAnalysisResponse(bad)).toBe(false);
  });

  it("rejects responses with invalid risk level", () => {
    const bad = { ...validResponse, risk: { ...validResponse.risk, level: "unknown" as any } };
    expect(isAnalysisResponse(bad)).toBe(false);
  });

  it("rejects responses with invalid detector status", () => {
    const badAudio = { ...validAudio, deepfake_detection: { ...deepfakeNotConfigured, status: "invalid" as any } };
    const bad = { ...validResponse, audio: badAudio };
    expect(isAnalysisResponse(bad)).toBe(false);
  });

  it("validates finding with null confidence", () => {
    expect(isAnalysisResponse({ ...validResponse, findings: [findingWithNullConfidence] })).toBe(true);
  });

  it("validates response with empty findings", () => {
    const resp = { ...validResponse, findings: [] };
    expect(isAnalysisResponse(resp)).toBe(true);
  });

  it("validates response with empty verification guidance", () => {
    const resp = { ...validResponse, verification_guidance: [] };
    expect(isAnalysisResponse(resp)).toBe(true);
  });

  it("validates response with empty warnings array", () => {
    const audio = { ...validAudio, validation_warnings: [] };
    const resp = { ...validResponse, audio };
    expect(isAnalysisResponse(resp)).toBe(true);
  });

  it("validates deepfake detection completed status", () => {
    const audio = { ...validAudio, deepfake_detection: deepfakeCompleted };
    const resp = { ...validResponse, audio };
    expect(isAnalysisResponse(resp)).toBe(true);
  });
});