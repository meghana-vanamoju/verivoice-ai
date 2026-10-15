export type RiskLevel = "low" | "medium" | "high";

export type DetectorStatus = "not_configured" | "completed" | "failed";

export interface DeepfakeDetection {
  status: DetectorStatus;
  score: number | null;
  label: string;
}

export interface AudioValidation {
  valid: boolean;
  format: string;
  duration_seconds: number | null;
  sample_rate_hz: number | null;
  channels: number | null;
  validation_warnings: string[];
  deepfake_detection: DeepfakeDetection;
}

export interface RiskSummary {
  score: number;
  level: RiskLevel;
  basis: string;
  summary: string;
}

export interface Finding {
  code: string;
  category: string;
  severity: string;
  title: string;
  evidence: string;
  source: string;
  confidence: number | null;
}

export interface VerificationGuidance {
  code: string;
  priority: string;
  message: string;
}

export interface AnalysisResponse {
  analysis_id: string;
  status: "completed";
  risk: RiskSummary;
  audio: AudioValidation;
  findings: Finding[];
  verification_guidance: VerificationGuidance[];
  limitations: string[];
}

export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

export function isAnalysisResponse(value: unknown): value is AnalysisResponse {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.analysis_id !== "string" || v.analysis_id.trim().length === 0) return false;
  if (v.status !== "completed") return false;
  if (!isRiskSummary(v.risk)) return false;
  if (!isAudioValidation(v.audio)) return false;
  if (!Array.isArray(v.findings) || !v.findings.every(isFinding)) return false;
  if (
    !Array.isArray(v.verification_guidance) ||
    !v.verification_guidance.every(isVerificationGuidance)
  )
    return false;
  if (
    !Array.isArray(v.limitations) ||
    !v.limitations.every((limitation) => typeof limitation === "string")
  )
    return false;
  return true;
}

function isRiskSummary(value: unknown): value is RiskSummary {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.score === "number" &&
    Number.isFinite(v.score) &&
    typeof v.level === "string" &&
    (v.level === "low" || v.level === "medium" || v.level === "high") &&
    typeof v.basis === "string" &&
    typeof v.summary === "string"
  );
}

function isAudioValidation(value: unknown): value is AudioValidation {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.valid !== "boolean") return false;
  if (typeof v.format !== "string") return false;
  if (v.duration_seconds !== null && typeof v.duration_seconds !== "number") return false;
  if (v.sample_rate_hz !== null && typeof v.sample_rate_hz !== "number") return false;
  if (v.channels !== null && typeof v.channels !== "number") return false;
  if (!Array.isArray(v.validation_warnings) || !v.validation_warnings.every((warning) => typeof warning === "string"))
    return false;
  if (!isDeepfakeDetection(v.deepfake_detection)) return false;
  return true;
}

function isDeepfakeDetection(value: unknown): value is DeepfakeDetection {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const statusOk =
    v.status === "not_configured" || v.status === "completed" || v.status === "failed";
  if (!statusOk) return false;
  if (v.score !== null && typeof v.score !== "number") return false;
  if (typeof v.label !== "string") return false;
  return true;
}

function isFinding(value: unknown): value is Finding {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.code !== "string") return false;
  if (typeof v.category !== "string") return false;
  if (typeof v.severity !== "string") return false;
  if (typeof v.title !== "string") return false;
  if (typeof v.evidence !== "string") return false;
  if (typeof v.source !== "string") return false;
  if (v.confidence !== null && typeof v.confidence !== "number") return false;
  return true;
}

function isVerificationGuidance(value: unknown): value is VerificationGuidance {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.code === "string" &&
    typeof v.priority === "string" &&
    typeof v.message === "string"
  );
}

export interface ApiErrorResponse {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export function extractApiError(payload: unknown): { code?: string; message?: string } | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const err = root.error;
  if (!err || typeof err !== "object") return null;
  const e = err as Record<string, unknown>;
  const result: { code?: string; message?: string } = {};
  if (typeof e.code === "string") result.code = e.code;
  if (typeof e.message === "string") result.message = e.message;
  return result;
}
