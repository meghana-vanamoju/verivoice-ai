import { isAnalysisResponse, extractApiError, type AnalysisResponse, MAX_AUDIO_BYTES } from "../types/analysis";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";

function normalizeBaseUrl(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (value.length === 0) {
    return DEFAULT_API_BASE_URL;
  }
  return value.replace(/\/+$/, "");
}

export const apiBaseUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL as string | undefined);

export class ApiRequestError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function analyzeAudio(params: {
  audio: File;
  context: string;
  transcript?: string;
  language?: string;
}): Promise<AnalysisResponse> {
  const formData = new FormData();
  formData.append("audio", params.audio);
  formData.append("context", params.context);
  if (params.transcript && params.transcript.trim().length > 0) {
    formData.append("transcript", params.transcript.trim());
  }
  if (params.language && params.language.trim().length > 0) {
    formData.append("language", params.language.trim());
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/v1/analyze`, {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new ApiRequestError(
      "Network error. Check that the backend is running and reachable, then retry.",
      0,
    );
  }

  const responseText = await response.text();
  let parsed: unknown = null;
  if (responseText.trim().length > 0) {
    try {
      parsed = JSON.parse(responseText);
    } catch {
      throw new ApiRequestError(
        "The server returned a response that is not valid JSON.",
        response.status,
      );
    }
  }

  if (!response.ok) {
    const extracted = extractApiError(parsed);
    const message =
      extracted?.message && extracted.message.trim().length > 0
        ? extracted.message
        : `Request failed with status ${response.status}.`;
    throw new ApiRequestError(message, response.status, extracted?.code);
  }

  if (!isAnalysisResponse(parsed)) {
    throw new ApiRequestError(
      "The server returned an incomplete or unexpected analysis response.",
      response.status,
    );
  }

  return parsed;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${apiBaseUrl}/health`, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

export { MAX_AUDIO_BYTES };
