import { describe, it, expect } from "vitest";
import type { AnalysisResponse, AudioValidation, DeepfakeDetection, Finding, VerificationGuidance } from "../analysis";
import { isAnalysisResponse } from "../analysis";

const deepfakeNotConfigured: DeepfakeDetection = {
  status: "not_configured",
  score: null,
  label: "unknown",
};

const deepfakeCompleted: DeepfakeDetection = {
  status: "completed",
  score: 0.85,
  label: "deepfake",
};

const deepfakeFailed: DeepfakeDetection = {
  status: "failed",
  score: null,
  label: "unknown",
};

const findingExample: Finding = {
  code: "urgent_action",
  category: "behavioral",
  severity: "high",
  title: "Urgent action requested",
  evidence: "The caller pressures the recipient to act immediately without verification.",
  source: "contextual_analysis",
  confidence: 0.87,
};

const findingWithNullConfidence: Finding = {
  code: "identity_uncertainty",
  category: "identity",
  severity: "medium",
  title: "Identity uncertain",
  evidence: "No matching voice profile found.",
  source: "contextual_analysis",
  confidence: null,
};

const validVerificationGuidance: VerificationGuidance = {
  code: "independent_contact",
  priority: "high",
  message: "Independently contact the supposed sender through a known, trusted phone number or channel. Do not use contact details provided in the suspicious communication.",
};

const validAudio: AudioValidation = {
  valid: true,
  format: "WAV",
  duration_sec: 58.3,
  sample_rate_hz: 44100,
  channel_count: 2,
  warnings: ["audio_duration_near_limit"],
  deepfake_detection: deepfakeNotConfigured,
};

const validResponse: AnalysisResponse = {
  analysis_id: "c5f8e2d1-3a7b-4e8c-9f1a-2b6d5e7f8a9c",
  status: "completed",
  risk: {
    score: 72,
    level: "high",
    basis: "contextual_indicators + technical_anomalies",
    summary: "High-risk indicators detected: urgency, money transfer request, and changed payment details.",
  },
  audio: validAudio,
  findings: [findingExample],
  verification_guidance: validVerificationGuidance,
  limitations: [
    "Audio validation confirms technical validity only; it does not verify speaker authenticity.",
    "Contextual indicators are heuristic warnings, not proof of impersonation or fraud.",
    "No deepfake detector is currently configured; results should not be interpreted as detector output.",
    "Risk score is a heuristic indicator and not a calibrated probability of fraud.",
  ],
};

const failedStatusResponse: AnalysisResponse = {
  ...validResponse,
  status: "failed",
};

describe("Analysis type validation", () => {
  describe("Contract-compliant responses", () => {
    it("validates a complete contract-compliant analysis response", () => {
      expect(isAnalysisResponse(validResponse)).toBe(true);
    });

    it("validates response with failed status", () => {
      expect(isAnalysisResponse(failedStatusResponse)).toBe(true);
    });

    it("validates response with completed detector status", () => {
      const audio = { ...validAudio, deepfake_detection: deepfakeCompleted };
      const resp = { ...validResponse, audio };
      expect(isAnalysisResponse(resp)).toBe(true);
    });

    it("validates response with failed detector status", () => {
      const audio = { ...validAudio, deepfake_detection: deepfakeFailed };
      const resp = { ...validResponse, audio };
      expect(isAnalysisResponse(resp)).toBe(true);
    });

    it("validates finding with null confidence", () => {
      expect(isAnalysisResponse({ ...validResponse, findings: [findingWithNullConfidence] })).toBe(true);
    });

    it("validates response with empty findings", () => {
      const resp = { ...validResponse, findings: [] };
      expect(isAnalysisResponse(resp)).toBe(true);
    });

    it("validates response with empty warnings array", () => {
      const audio = { ...validAudio, warnings: [] };
      const resp = { ...validResponse, audio };
      expect(isAnalysisResponse(resp)).toBe(true);
    });

    it("validates nullable audio fields when null", () => {
      const audio = { ...validAudio, duration_sec: null, sample_rate_hz: null, channel_count: null };
      const resp = { ...validResponse, audio };
      expect(isAnalysisResponse(resp)).toBe(true);
    });

    it("validates detector label as string when completed", () => {
      const audio = { ...validAudio, deepfake_detection: { ...deepfakeCompleted, label: "genuine" } };
      const resp = { ...validResponse, audio };
      expect(isAnalysisResponse(resp)).toBe(true);
    });

    it("validates detector label as null when not_configured", () => {
      const audio = { ...validAudio, deepfake_detection: { ...deepfakeNotConfigured, label: null } };
      const resp = { ...validResponse, audio };
      expect(isAnalysisResponse(resp)).toBe(true);
    });

    it("validates detector label as null when failed", () => {
      const audio = { ...validAudio, deepfake_detection: { ...deepfakeFailed, label: null } };
      const resp = { ...validResponse, audio };
      expect(isAnalysisResponse(resp)).toBe(true);
    });

    it("validates detector score as number when completed", () => {
      const audio = { ...validAudio, deepfake_detection: { ...deepfakeCompleted, score: 0.92 } };
      const resp = { ...validResponse, audio };
      expect(isAnalysisResponse(resp)).toBe(true);
    });

    it("validates detector score as null when not_configured", () => {
      const audio = { ...validAudio, deepfake_detection: { ...deepfakeNotConfigured, score: null } };
      const resp = { ...validResponse, audio };
      expect(isAnalysisResponse(resp)).toBe(true);
    });

    it("validates detector score as null when failed", () => {
      const audio = { ...validAudio, deepfake_detection: { ...deepfakeFailed, score: null } };
      const resp = { ...validResponse, audio };
      expect(isAnalysisResponse(resp)).toBe(true);
    });

    it("validates all risk levels", () => {
      expect(isAnalysisResponse({ ...validResponse, risk: { ...validResponse.risk, level: "low", score: 10 } })).toBe(true);
      expect(isAnalysisResponse({ ...validResponse, risk: { ...validResponse.risk, level: "medium", score: 50 } })).toBe(true);
      expect(isAnalysisResponse({ ...validResponse, risk: { ...validResponse.risk, level: "high", score: 90 } })).toBe(true);
    });
  });

  describe("Invalid field types", () => {
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

    it("rejects responses with verification_guidance as array (old format)", () => {
      const bad = { ...validResponse, verification_guidance: [validVerificationGuidance] as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects responses with invalid verification_guidance type", () => {
      const bad = { ...validResponse, verification_guidance: "not-an-object" as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects responses with missing verification_guidance fields", () => {
      const bad = { ...validResponse, verification_guidance: { code: "independent_contact" } as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects responses with invalid finding type", () => {
      const bad = { ...validResponse, findings: "not-an-array" as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects responses with invalid audio type", () => {
      const bad = { ...validResponse, audio: "not-an-object" as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects responses with invalid risk type", () => {
      const bad = { ...validResponse, risk: "not-an-object" as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects responses with invalid limitations type", () => {
      const bad = { ...validResponse, limitations: "not-an-array" as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects responses with non-string analysis_id", () => {
      const bad = { ...validResponse, analysis_id: 123 as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects responses with invalid status value", () => {
      const bad = { ...validResponse, status: "pending" as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects responses with invalid finding fields", () => {
      const badFinding = { ...findingExample, code: 123 as any };
      const bad = { ...validResponse, findings: [badFinding] };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects responses with non-finite confidence", () => {
      const badFinding = { ...findingExample, confidence: NaN };
      const bad = { ...validResponse, findings: [badFinding] };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects responses with non-finite confidence (Infinity)", () => {
      const badFinding = { ...findingExample, confidence: Infinity };
      const bad = { ...validResponse, findings: [badFinding] };
      expect(isAnalysisResponse(bad)).toBe(false);
    });
  });

  describe("Invalid numeric values", () => {
    it("rejects non-finite risk score (NaN)", () => {
      const bad = { ...validResponse, risk: { ...validResponse.risk, score: NaN } };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects non-finite risk score (Infinity)", () => {
      const bad = { ...validResponse, risk: { ...validResponse.risk, score: Infinity } };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects non-finite risk score (-Infinity)", () => {
      const bad = { ...validResponse, risk: { ...validResponse.risk, score: -Infinity } };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects non-finite duration_sec", () => {
      const audio = { ...validAudio, duration_sec: NaN };
      const bad = { ...validResponse, audio };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects non-finite sample_rate_hz", () => {
      const audio = { ...validAudio, sample_rate_hz: Infinity };
      const bad = { ...validResponse, audio };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects non-finite channel_count", () => {
      const audio = { ...validAudio, channel_count: -Infinity };
      const bad = { ...validResponse, audio };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects non-finite detector score", () => {
      const audio = { ...validAudio, deepfake_detection: { ...deepfakeCompleted, score: NaN } };
      const bad = { ...validResponse, audio };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects non-finite detector score (Infinity)", () => {
      const audio = { ...validAudio, deepfake_detection: { ...deepfakeCompleted, score: Infinity } };
      const bad = { ...validResponse, audio };
      expect(isAnalysisResponse(bad)).toBe(false);
    });
  });

  describe("Nullable detector fields per contract", () => {
    it("accepts null label with not_configured status", () => {
      const audio = { ...validAudio, deepfake_detection: { status: "not_configured", score: null, label: null } };
      const resp = { ...validResponse, audio };
      expect(isAnalysisResponse(resp)).toBe(true);
    });

    it("accepts null label with failed status", () => {
      const audio = { ...validAudio, deepfake_detection: { status: "failed", score: null, label: null } };
      const resp = { ...validResponse, audio };
      expect(isAnalysisResponse(resp)).toBe(true);
    });

    it("accepts null score with not_configured status", () => {
      const audio = { ...validAudio, deepfake_detection: { status: "not_configured", score: null, label: "unknown" } };
      const resp = { ...validResponse, audio };
      expect(isAnalysisResponse(resp)).toBe(true);
    });

    it("accepts null score with failed status", () => {
      const audio = { ...validAudio, deepfake_detection: { status: "failed", score: null, label: "unknown" } };
      const resp = { ...validResponse, audio };
      expect(isAnalysisResponse(resp)).toBe(true);
    });

    it("rejects non-null label with non-string type", () => {
      const audio = { ...validAudio, deepfake_detection: { ...deepfakeCompleted, label: 123 as any } };
      const bad = { ...validResponse, audio };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects non-null score with non-number type", () => {
      const audio = { ...validAudio, deepfake_detection: { ...deepfakeCompleted, score: "high" as any } };
      const bad = { ...validResponse, audio };
      expect(isAnalysisResponse(bad)).toBe(false);
    });
  });

  describe("Documented detector statuses", () => {
    it("accepts not_configured status", () => {
      const audio = { ...validAudio, deepfake_detection: { status: "not_configured", score: null, label: "unknown" } };
      const resp = { ...validResponse, audio };
      expect(isAnalysisResponse(resp)).toBe(true);
    });

    it("accepts completed status", () => {
      const audio = { ...validAudio, deepfake_detection: { status: "completed", score: 0.85, label: "deepfake" } };
      const resp = { ...validResponse, audio };
      expect(isAnalysisResponse(resp)).toBe(true);
    });

    it("accepts failed status", () => {
      const audio = { ...validAudio, deepfake_detection: { status: "failed", score: null, label: "unknown" } };
      const resp = { ...validResponse, audio };
      expect(isAnalysisResponse(resp)).toBe(true);
    });

    it("rejects undocumented detector status", () => {
      const audio = { ...validAudio, deepfake_detection: { status: "pending" as any, score: null, label: "unknown" } };
      const bad = { ...validResponse, audio };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects detector status with wrong case", () => {
      const audio = { ...validAudio, deepfake_detection: { status: "NOT_CONFIGURED" as any, score: null, label: "unknown" } };
      const bad = { ...validResponse, audio };
      expect(isAnalysisResponse(bad)).toBe(false);
    });
  });

  describe("Malformed guidance objects", () => {
    it("rejects verification_guidance missing code", () => {
      const bad = { ...validResponse, verification_guidance: { priority: "high", message: "test" } as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects verification_guidance missing priority", () => {
      const bad = { ...validResponse, verification_guidance: { code: "test", message: "test" } as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects verification_guidance missing message", () => {
      const bad = { ...validResponse, verification_guidance: { code: "test", priority: "high" } as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects verification_guidance with non-string code", () => {
      const bad = { ...validResponse, verification_guidance: { code: 123, priority: "high", message: "test" } as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects verification_guidance with non-string priority", () => {
      const bad = { ...validResponse, verification_guidance: { code: "test", priority: 123, message: "test" } as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects verification_guidance with non-string message", () => {
      const bad = { ...validResponse, verification_guidance: { code: "test", priority: "high", message: 123 } as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects verification_guidance as null", () => {
      const bad = { ...validResponse, verification_guidance: null as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects verification_guidance as array", () => {
      const bad = { ...validResponse, verification_guidance: [{ code: "test", priority: "high", message: "test" }] as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });
  });

  describe("Invalid response statuses", () => {
    it("rejects pending status", () => {
      const bad = { ...validResponse, status: "pending" as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects processing status", () => {
      const bad = { ...validResponse, status: "processing" as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects error status", () => {
      const bad = { ...validResponse, status: "error" as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects empty string status", () => {
      const bad = { ...validResponse, status: "" as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects null status", () => {
      const bad = { ...validResponse, status: null as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects numeric status", () => {
      const bad = { ...validResponse, status: 200 as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });
  });

  describe("Audio field validation", () => {
    it("rejects non-boolean valid field", () => {
      const audio = { ...validAudio, valid: "true" as any };
      const bad = { ...validResponse, audio };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects non-string format field", () => {
      const audio = { ...validAudio, format: 123 as any };
      const bad = { ...validResponse, audio };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects non-array warnings field", () => {
      const audio = { ...validAudio, warnings: "not-an-array" as any };
      const bad = { ...validResponse, audio };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects warnings with non-string elements", () => {
      const audio = { ...validAudio, warnings: [123] as any };
      const bad = { ...validResponse, audio };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects non-object deepfake_detection", () => {
      const audio = { ...validAudio, deepfake_detection: "not-an-object" as any };
      const bad = { ...validResponse, audio };
      expect(isAnalysisResponse(bad)).toBe(false);
    });
  });

  describe("Limitations validation", () => {
    it("rejects non-array limitations", () => {
      const bad = { ...validResponse, limitations: "not-an-array" as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("rejects limitations with non-string elements", () => {
      const bad = { ...validResponse, limitations: [123] as any };
      expect(isAnalysisResponse(bad)).toBe(false);
    });

    it("accepts empty limitations array", () => {
      const bad = { ...validResponse, limitations: [] };
      expect(isAnalysisResponse(bad)).toBe(true);
    });
  });
});