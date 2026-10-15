import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { analyzeAudio, checkHealth, ApiRequestError } from "../api";

const mockAudioFile = new File(["fake audio content"], "test.wav", { type: "audio/wav" });
const mockContext = "Urgent request to transfer funds";

const validContractResponse = {
  analysis_id: "c5f8e2d1-3a7b-4e8c-9f1a-2b6d5e7f8a9c",
  status: "completed",
  risk: {
    score: 72,
    level: "high",
    basis: "contextual_indicators + technical_anomalies",
    summary: "High-risk indicators detected.",
  },
  audio: {
    valid: true,
    format: "WAV",
    duration_sec: 58.3,
    sample_rate_hz: 44100,
    channel_count: 2,
    warnings: ["audio_duration_near_limit"],
    deepfake_detection: {
      status: "not_configured",
      score: null,
      label: "unknown",
    },
  },
  findings: [
    {
      code: "urgent_action",
      category: "behavioral",
      severity: "high",
      title: "Urgent action requested",
      evidence: "The caller pressures the recipient to act immediately.",
      source: "contextual_analysis",
      confidence: 0.87,
    },
  ],
  verification_guidance: {
    code: "independent_contact",
    priority: "high",
    message: "Independently contact the supposed sender through a known, trusted channel.",
  },
  limitations: [
    "Audio validation confirms technical validity only; it does not verify speaker authenticity.",
    "No deepfake detector is currently configured.",
  ],
};

describe("analyzeAudio", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sends multipart request with required audio and context fields", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(validContractResponse)),
    } as Response);

    await analyzeAudio({ audio: mockAudioFile, context: mockContext });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8000/api/v1/analyze");
    expect(options?.method).toBe("POST");
    expect(options?.body).toBeInstanceOf(FormData);

    const formData = options?.body as FormData;
    expect(formData.get("audio")).toBe(mockAudioFile);
    expect(formData.get("context")).toBe(mockContext);
    expect(formData.has("transcript")).toBe(false);
    expect(formData.has("language")).toBe(false);
  });

  it("includes transcript in request when provided and non-empty", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(validContractResponse)),
    } as Response);

    await analyzeAudio({
      audio: mockAudioFile,
      context: mockContext,
      transcript: "Transfer the money now.",
    });

    const formData = (fetchMock.mock.calls[0][1]?.body as FormData);
    expect(formData.get("transcript")).toBe("Transfer the money now.");
  });

  it("omits transcript when empty string", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(validContractResponse)),
    } as Response);

    await analyzeAudio({
      audio: mockAudioFile,
      context: mockContext,
      transcript: "",
    });

    const formData = (fetchMock.mock.calls[0][1]?.body as FormData);
    expect(formData.has("transcript")).toBe(false);
  });

  it("omits transcript when whitespace only", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(validContractResponse)),
    } as Response);

    await analyzeAudio({
      audio: mockAudioFile,
      context: mockContext,
      transcript: "   ",
    });

    const formData = (fetchMock.mock.calls[0][1]?.body as FormData);
    expect(formData.has("transcript")).toBe(false);
  });

  it("includes language in request when provided and non-empty", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(validContractResponse)),
    } as Response);

    await analyzeAudio({
      audio: mockAudioFile,
      context: mockContext,
      language: "en-US",
    });

    const formData = (fetchMock.mock.calls[0][1]?.body as FormData);
    expect(formData.get("language")).toBe("en-US");
  });

  it("omits language when empty string", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(validContractResponse)),
    } as Response);

    await analyzeAudio({
      audio: mockAudioFile,
      context: mockContext,
      language: "",
    });

    const formData = (fetchMock.mock.calls[0][1]?.body as FormData);
    expect(formData.has("language")).toBe(false);
  });

  it("accepts contract-compliant response with completed status", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(validContractResponse)),
    } as Response);

    const result = await analyzeAudio({ audio: mockAudioFile, context: mockContext });

    expect(result).toEqual(validContractResponse);
  });

  it("accepts contract-compliant response with failed status", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const failedResponse = { ...validContractResponse, status: "failed" as const };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(failedResponse)),
    } as Response);

    const result = await analyzeAudio({ audio: mockAudioFile, context: mockContext });

    expect(result).toEqual(failedResponse);
  });

  it("accepts response with completed detector status", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const response = {
      ...validContractResponse,
      audio: {
        ...validContractResponse.audio,
        deepfake_detection: {
          status: "completed" as const,
          score: 0.85,
          label: "deepfake",
        },
      },
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(response)),
    } as Response);

    const result = await analyzeAudio({ audio: mockAudioFile, context: mockContext });

    expect(result.audio.deepfake_detection.status).toBe("completed");
    expect(result.audio.deepfake_detection.score).toBe(0.85);
    expect(result.audio.deepfake_detection.label).toBe("deepfake");
  });

  it("accepts response with failed detector status and null fields", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const response = {
      ...validContractResponse,
      audio: {
        ...validContractResponse.audio,
        deepfake_detection: {
          status: "failed" as const,
          score: null,
          label: null,
        },
      },
    };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve(JSON.stringify(response)),
    } as Response);

    const result = await analyzeAudio({ audio: mockAudioFile, context: mockContext });

    expect(result.audio.deepfake_detection.status).toBe("failed");
    expect(result.audio.deepfake_detection.score).toBeNull();
    expect(result.audio.deepfake_detection.label).toBeNull();
  });

  it("throws ApiRequestError with status, code, and message for 400 error", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve(JSON.stringify({
        error: { code: "malformed_audio", message: "Audio file is malformed.", details: null },
      })),
    } as Response);

    try {
      await analyzeAudio({ audio: mockAudioFile, context: mockContext });
      throw new Error("Expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect((err as ApiRequestError).status).toBe(400);
      expect((err as ApiRequestError).code).toBe("malformed_audio");
      expect((err as ApiRequestError).message).toBe("Audio file is malformed.");
    }
  });

  it("throws ApiRequestError with status, code, and message for 413 limit exceeded", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 413,
      text: () => Promise.resolve(JSON.stringify({
        error: { code: "limit_exceeded", message: "Audio duration exceeds 120 seconds.", details: null },
      })),
    } as Response);

    try {
      await analyzeAudio({ audio: mockAudioFile, context: mockContext });
      throw new Error("Expected to throw");
    } catch (err) {
      expect((err as ApiRequestError).status).toBe(413);
      expect((err as ApiRequestError).code).toBe("limit_exceeded");
      expect((err as ApiRequestError).message).toBe("Audio duration exceeds 120 seconds.");
    }
  });

  it("throws ApiRequestError with status, code, and message for 415 unsupported format", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 415,
      text: () => Promise.resolve(JSON.stringify({
        error: { code: "unsupported_format", message: "Only WAV files are supported.", details: null },
      })),
    } as Response);

    try {
      await analyzeAudio({ audio: mockAudioFile, context: mockContext });
      throw new Error("Expected to throw");
    } catch (err) {
      expect((err as ApiRequestError).status).toBe(415);
      expect((err as ApiRequestError).code).toBe("unsupported_format");
      expect((err as ApiRequestError).message).toBe("Only WAV files are supported.");
    }
  });

  it("throws ApiRequestError with status, code, and message for 422 missing field", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: () => Promise.resolve(JSON.stringify({
        error: { code: "missing_field", message: "Required field 'context' is missing or empty.", details: null },
      })),
    } as Response);

    try {
      await analyzeAudio({ audio: mockAudioFile, context: mockContext });
      throw new Error("Expected to throw");
    } catch (err) {
      expect((err as ApiRequestError).status).toBe(422);
      expect((err as ApiRequestError).code).toBe("missing_field");
      expect((err as ApiRequestError).message).toBe("Required field 'context' is missing or empty.");
    }
  });

  it("throws ApiRequestError for 500 server error", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve(JSON.stringify({
        error: { code: "internal_error", message: "An unexpected error occurred.", details: null },
      })),
    } as Response);

    try {
      await analyzeAudio({ audio: mockAudioFile, context: mockContext });
      throw new Error("Expected to throw");
    } catch (err) {
      expect((err as ApiRequestError).status).toBe(500);
      expect((err as ApiRequestError).code).toBe("internal_error");
    }
  });

  it("falls back to status message when error response lacks message", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve(JSON.stringify({ error: { code: "bad_request", message: "", details: null } })),
    } as Response);

    try {
      await analyzeAudio({ audio: mockAudioFile, context: mockContext });
      throw new Error("Expected to throw");
    } catch (err) {
      expect((err as ApiRequestError).status).toBe(400);
      expect((err as ApiRequestError).code).toBe("bad_request");
      expect((err as ApiRequestError).message).toBe("Request failed with status 400.");
    }
  });

  it("throws ApiRequestError for invalid JSON response", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve("not valid json"),
    } as Response);

    try {
      await analyzeAudio({ audio: mockAudioFile, context: mockContext });
      throw new Error("Expected to throw");
    } catch (err) {
      expect((err as ApiRequestError).status).toBe(200);
      expect((err as ApiRequestError).message).toBe("The server returned a response that is not valid JSON.");
    }
  });

  it("throws ApiRequestError for malformed successful response (fails validation)", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ invalid: "response" })),
    } as Response);

    try {
      await analyzeAudio({ audio: mockAudioFile, context: mockContext });
      throw new Error("Expected to throw");
    } catch (err) {
      expect((err as ApiRequestError).status).toBe(200);
      expect((err as ApiRequestError).message).toBe("The server returned an incomplete or unexpected analysis response.");
    }
  });

  it("throws ApiRequestError for empty response body", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
    } as Response);

    try {
      await analyzeAudio({ audio: mockAudioFile, context: mockContext });
      throw new Error("Expected to throw");
    } catch (err) {
      expect((err as ApiRequestError).status).toBe(200);
      expect((err as ApiRequestError).message).toBe("The server returned an incomplete or unexpected analysis response.");
    }
  });

  it("throws ApiRequestError for network failure", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    try {
      await analyzeAudio({ audio: mockAudioFile, context: mockContext });
      throw new Error("Expected to throw");
    } catch (err) {
      expect((err as ApiRequestError).status).toBe(0);
      expect((err as ApiRequestError).message).toBe("Network error. Check that the backend is running and reachable, then retry.");
      expect((err as ApiRequestError).code).toBeUndefined();
    }
  });

  it("uses VITE_API_BASE_URL when configured", async () => {
    const originalEnv = import.meta.env.VITE_API_BASE_URL;
    import.meta.env.VITE_API_BASE_URL = "https://custom-api.example.com";

    try {
      vi.resetModules();
      const { analyzeAudio: analyzeAudioWithEnv } = await import("../api");

      const fetchMock = vi.mocked(globalThis.fetch);
      fetchMock.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(validContractResponse)),
      } as Response);

      await analyzeAudioWithEnv({ audio: mockAudioFile, context: mockContext });

      expect(fetchMock).toHaveBeenCalledWith(
        "https://custom-api.example.com/api/v1/analyze",
        expect.any(Object)
      );
    } finally {
      import.meta.env.VITE_API_BASE_URL = originalEnv;
      vi.resetModules();
    }
  });

  it("throws timeout error when request exceeds timeout", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    // Mock fetch to reject when signal is aborted
    const abortController = new AbortController();
    fetchMock.mockImplementationOnce((_url, options) => {
      const signal = options?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        // Link the external signal to our internal controller
        if (signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal?.addEventListener("abort", () => {
          abortController.abort();
          reject(new DOMException("Aborted", "AbortError"));
        });
        // Never resolve - let timeout handle it
      });
    });

    const analyzePromise = analyzeAudio({ audio: mockAudioFile, context: mockContext }, { timeoutMs: 100 });
    // Suppress unhandled rejection from mock fetch promise
    analyzePromise.catch(() => {});

    // Advance timers to trigger timeout
    await vi.advanceTimersByTimeAsync(150);

    try {
      await analyzePromise;
      throw new Error("Expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect((err as ApiRequestError).code).toBe("timeout");
      expect((err as ApiRequestError).message).toContain("timed out");
      expect((err as ApiRequestError).status).toBe(0);
    } finally {
      // Clean up any pending promise
      abortController.abort();
    }
  });

  it("distinguishes timeout from network failure", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const abortController = new AbortController();
    fetchMock.mockImplementationOnce((_url, options) => {
      const signal = options?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal?.addEventListener("abort", () => {
          abortController?.abort();
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    const analyzePromise = analyzeAudio({ audio: mockAudioFile, context: mockContext }, { timeoutMs: 50 });
    analyzePromise.catch(() => {});

    await vi.advanceTimersByTimeAsync(100);

    try {
      await analyzePromise;
      throw new Error("Expected to throw");
    } catch (err) {
      expect((err as ApiRequestError).code).toBe("timeout");
      expect((err as ApiRequestError).message).toContain("timed out");
    } finally {
      abortController?.abort();
    }

    // Network failure should have different code
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    try {
      await analyzeAudio({ audio: mockAudioFile, context: mockContext });
      throw new Error("Expected to throw");
    } catch (err) {
      expect((err as ApiRequestError).code).toBeUndefined();
      expect((err as ApiRequestError).message).toContain("Network error");
    }
  });

  it("allows cancellation via AbortSignal", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    const abortController = new AbortController();
    fetchMock.mockImplementationOnce((_url, options) => {
      const signal = options?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal?.addEventListener("abort", () => {
          abortController?.abort();
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });

    const controller = new AbortController();
    // Cancel after a short delay
    setTimeout(() => controller.abort(), 10);

    const analyzePromise = analyzeAudio({ audio: mockAudioFile, context: mockContext }, { signal: controller.signal });
    analyzePromise.catch(() => {});

    // Advance timers to trigger the cancellation
    await vi.advanceTimersByTimeAsync(50);

    try {
      await analyzePromise;
      throw new Error("Expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect((err as ApiRequestError).code).toBe("cancelled");
      expect((err as ApiRequestError).message).toBe("Request was cancelled.");
    } finally {
      abortController?.abort();
    }
  });

  it("throws cancelled error if signal is already aborted", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);

    const controller = new AbortController();
    controller.abort();

    try {
      await analyzeAudio({ audio: mockAudioFile, context: mockContext }, { signal: controller.signal });
      throw new Error("Expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect((err as ApiRequestError).code).toBe("cancelled");
      expect((err as ApiRequestError).message).toBe("Request was cancelled.");
    }
    // Fails fast without issuing a network request.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws timeout error when response body reading stalls", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    // Mock fetch resolves quickly, but response.text() stalls until aborted.
    fetchMock.mockImplementationOnce((_url, options) => {
      const signal = options?.signal as AbortSignal;
      const mockResponse = {
        ok: true,
        status: 200,
        text: () =>
          new Promise<string>((_resolve, reject) => {
            if (signal?.aborted) {
              reject(new DOMException("Aborted", "AbortError"));
              return;
            }
            signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
            // Never resolve - the request timeout must abort it.
          }),
      } as Response;
      return Promise.resolve(mockResponse);
    });

    const analyzePromise = analyzeAudio({ audio: mockAudioFile, context: mockContext }, { timeoutMs: 100 });
    // Suppress unhandled rejection from the mock promise chain
    analyzePromise.catch(() => {});

    // Advance timers past the timeout; it must still fire during body reading.
    await vi.advanceTimersByTimeAsync(150);

    try {
      await analyzePromise;
      throw new Error("Expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect((err as ApiRequestError).code).toBe("timeout");
      expect((err as ApiRequestError).message).toContain("timed out");
      expect((err as ApiRequestError).status).toBe(0);
    }
  });

  it("distinguishes response-body cancellation from timeout", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementationOnce((_url, options) => {
      const signal = options?.signal as AbortSignal;
      const mockResponse = {
        ok: true,
        status: 200,
        text: () =>
          new Promise<string>((_resolve, reject) => {
            if (signal?.aborted) {
              reject(new DOMException("Aborted", "AbortError"));
              return;
            }
            signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      } as Response;
      return Promise.resolve(mockResponse);
    });

    const controller = new AbortController();
    const analyzePromise = analyzeAudio(
      { audio: mockAudioFile, context: mockContext },
      { signal: controller.signal, timeoutMs: 30000 }
    );
    analyzePromise.catch(() => {});

    // Let fetch resolve and body reading start, then cancel externally.
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    try {
      await analyzePromise;
      throw new Error("Expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect((err as ApiRequestError).code).toBe("cancelled");
      expect((err as ApiRequestError).message).toBe("Request was cancelled.");
    }
  });
});

describe("checkHealth", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns true for successful health check", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce({ ok: true } as Response);

    const result = await checkHealth();

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8000/health", { method: "GET" });
  });

  it("returns false for failed health check", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 } as Response);

    const result = await checkHealth();

    expect(result).toBe(false);
  });

  it("returns false for network error", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const result = await checkHealth();

    expect(result).toBe(false);
  });
});

describe("ApiRequestError", () => {
  it("constructs with message and status", () => {
    const err = new ApiRequestError("Network failure", 0);
    expect(err.message).toBe("Network failure");
    expect(err.status).toBe(0);
  });

  it("includes optional code and details", () => {
    const err = new ApiRequestError("Bad request", 400, "invalid_input", { field: "context" });
    expect(err.code).toBe("invalid_input");
    expect(err.details).toEqual({ field: "context" });
  });

  it("is an Error instance", () => {
    const err = new ApiRequestError("test", 0);
    expect(err instanceof Error).toBe(true);
  });

  it("has correct name property", () => {
    const err = new ApiRequestError("test", 0);
    expect(err.name).toBe("ApiRequestError");
  });
});