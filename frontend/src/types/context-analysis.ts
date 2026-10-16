export type RiskLevel = "low" | "moderate" | "high" | "critical";

export interface ContextFinding {
  code: string;
  title: string;
  evidence: string[];
  score: number;
}

export interface ContextAnalysisResult {
  findings: ContextFinding[];
  score: number;
  level: RiskLevel;
  guidance: string[];
}

export interface ContextAnalysisRequest {
  context: string;
  transcript?: string;
}

export function isContextAnalysisResult(value: unknown): value is ContextAnalysisResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.findings) || !v.findings.every(isContextFinding)) return false;
  if (typeof v.score !== "number" || !Number.isFinite(v.score)) return false;
  if (
    v.level !== "low" &&
    v.level !== "moderate" &&
    v.level !== "high" &&
    v.level !== "critical"
  )
    return false;
  if (!Array.isArray(v.guidance) || !v.guidance.every((item) => typeof item === "string"))
    return false;
  return true;
}

function isContextFinding(value: unknown): value is ContextFinding {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.code === "string" &&
    typeof v.title === "string" &&
    Array.isArray(v.evidence) &&
    v.evidence.every((item) => typeof item === "string") &&
    typeof v.score === "number" &&
    Number.isFinite(v.score)
  );
}
