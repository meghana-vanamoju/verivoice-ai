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
