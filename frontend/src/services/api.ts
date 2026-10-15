import { isAnalysisResponse, extractApiError, type AnalysisResponse, MAX_AUDIO_BYTES } from "../types/analysis";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

function normalizeBaseUrl(raw: string | undefined): string {
  const value = (raw ?? "").trim();
  if (value.length === 0) {
    return DEFAULT_API_BASE_URL;
  }
  // Validate URL format and protocol
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid VITE_API_BASE_URL: "${value}" is not a valid URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Invalid VITE_API_BASE_URL: "${value}" uses unsupported protocol "${parsed.protocol}". Only http: and https: are allowed.`);
  }
  // Remove trailing slashes
  return parsed.origin + parsed.pathname.replace(/\/+$/, "");
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

export interface AnalyzeAudioOptions {
  /** AbortSignal to cancel the request */
  signal?: AbortSignal;
  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException || error instanceof Error) &&
    error.name === "AbortError"
  );
}

export async function analyzeAudio(
  params: {
    audio: File;
    context: string;
    transcript?: string;
    language?: string;
  },
  options: AnalyzeAudioOptions = {}
): Promise<AnalysisResponse> {
  const { signal, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = options;

  // Fail fast if the caller already cancelled before the request started.
  if (signal?.aborted) {
    throw new ApiRequestError("Request was cancelled.", 0, "cancelled");
  }

  const formData = new FormData();
  formData.append("audio", params.audio);
  formData.append("context", params.context);
  if (params.transcript && params.transcript.trim().length > 0) {
    formData.append("transcript", params.transcript.trim());
  }
  if (params.language && params.language.trim().length > 0) {
    formData.append("language", params.language.trim());
  }

  // One AbortController drives both timeout and external cancellation for the
  // whole request lifecycle: fetch *and* reading the response body.
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let externalAbortListener: (() => void) | null = null;
  if (signal) {
    externalAbortListener = () => controller.abort();
    signal.addEventListener("abort", externalAbortListener);
  }

  try {
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/api/v1/analyze`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
    } catch (error) {
      if (isAbortError(error)) {
        // External cancellation wins over timeout if both fire together.
        if (signal?.aborted) {
          throw new ApiRequestError("Request was cancelled.", 0, "cancelled");
        }
        if (timedOut) {
          throw new ApiRequestError(
            `Request timed out after ${timeoutMs} ms.`,
            0,
            "timeout",
          );
        }
      }
      throw new ApiRequestError(
        "Network error. Check that the backend is running and reachable, then retry.",
        0,
      );
    }

    // Read the response body under the same timeout/cancellation coverage, so a
    // stalled body read is aborted and reported as a timeout (or cancellation).
    let responseText: string;
    try {
      responseText = await response.text();
    } catch (error) {
      if (isAbortError(error)) {
        if (signal?.aborted) {
          throw new ApiRequestError("Request was cancelled.", 0, "cancelled");
        }
        if (timedOut) {
          throw new ApiRequestError(
            `Request timed out after ${timeoutMs} ms.`,
            0,
            "timeout",
          );
        }
      }
      throw new ApiRequestError(
        "Network error while reading the response. Check that the backend is running and reachable, then retry.",
        0,
      );
    }

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
  } finally {
    // Single cleanup point: runs after fetch and body reading complete (or
    // fail), so the timer never leaks and the external listener is removed.
    clearTimeout(timeoutId);
    if (signal && externalAbortListener) {
      signal.removeEventListener("abort", externalAbortListener);
    }
  }
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${apiBaseUrl}/health`, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

export { MAX_AUDIO_BYTES, DEFAULT_REQUEST_TIMEOUT_MS };