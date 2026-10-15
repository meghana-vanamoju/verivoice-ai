import type {
  ContextAnalysisRequest,
  ContextAnalysisResult,
} from "../types/context-analysis";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

export async function analyzeContext(
  request: ContextAnalysisRequest,
): Promise<ContextAnalysisResult> {
  const response = await fetch(`${apiBaseUrl}/api/v1/context/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const detail = await response
      .json()
      .then((body: { detail?: string | { msg?: string }[] }) => {
        if (typeof body.detail === "string") return body.detail;
        if (Array.isArray(body.detail)) {
          return body.detail.map((item) => item.msg).filter(Boolean).join("; ");
        }
        return `Request failed with status ${response.status}.`;
      })
      .catch(() => `Request failed with status ${response.status}.`);
    throw new Error(detail);
  }

  return (await response.json()) as ContextAnalysisResult;
}
