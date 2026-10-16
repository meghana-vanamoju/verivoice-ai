import { apiBaseUrl } from "./api";
import { extractApiError } from "../types/analysis";
import {
  isContextAnalysisResult,
  type ContextAnalysisRequest,
  type ContextAnalysisResult,
} from "../types/context-analysis";

export async function analyzeContext(
  request: ContextAnalysisRequest,
): Promise<ContextAnalysisResult> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/v1/context/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    throw new Error(
      "Network error. Check that the backend is running and reachable, then retry.",
    );
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    // The backend uses the documented error envelope:
    // {"error": {"code": ..., "message": ..., "details": ...}}
    const extracted = extractApiError(body);
    const message =
      extracted?.message && extracted.message.trim().length > 0
        ? extracted.message
        : `Request failed with status ${response.status}.`;
    throw new Error(message);
  }

  if (!isContextAnalysisResult(body)) {
    throw new Error("The server returned an incomplete or unexpected analysis response.");
  }

  return body;
}
