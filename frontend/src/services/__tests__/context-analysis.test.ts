import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeContext } from "../context-analysis";
import { apiBaseUrl } from "../api";
import type { ContextAnalysisResult } from "../../types/context-analysis";

const validResult: ContextAnalysisResult = {
  findings: [
    {
      code: "MONEY_TRANSFER",
      title: "Request to send or transfer money",
      evidence: ["wire the funds"],
      score: 30,
    },
  ],
  score: 30,
  level: "moderate",
  guidance: ["Verify through a known contact before transferring funds."],
};

function mockResponse(init: {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
}): Response {
  return {
    ok: init.ok,
    status: init.status,
    json: init.json ?? (() => Promise.reject(new Error("no body"))),
  } as unknown as Response;
}

describe("analyzeContext", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts JSON to the shared backend base URL", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      mockResponse({ ok: true, status: 200, json: () => Promise.resolve(validResult) }),
    );

    await analyzeContext({ context: "A supplier called.", transcript: "wire funds" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`${apiBaseUrl}/api/v1/context/analyze`);
    expect(options?.method).toBe("POST");
    expect(options?.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(options?.body as string)).toEqual({
      context: "A supplier called.",
      transcript: "wire funds",
    });
  });

  it("returns the validated result on success", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      mockResponse({ ok: true, status: 200, json: () => Promise.resolve(validResult) }),
    );

    await expect(analyzeContext({ context: "x" })).resolves.toEqual(validResult);
  });

  it("surfaces the documented backend error envelope message", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        ok: false,
        status: 422,
        json: () =>
          Promise.resolve({
            error: {
              code: "missing_field",
              message: "Required field 'context' is missing or empty.",
              details: null,
            },
          }),
      }),
    );

    await expect(analyzeContext({ context: "x" })).rejects.toThrow(
      "Required field 'context' is missing or empty.",
    );
  });

  it("falls back to a status message when the error body is not the envelope", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      mockResponse({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ detail: "legacy shape" }),
      }),
    );

    await expect(analyzeContext({ context: "x" })).rejects.toThrow(
      "Request failed with status 500.",
    );
  });

  it("rejects a malformed success response", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      mockResponse({ ok: true, status: 200, json: () => Promise.resolve({ score: 30 }) }),
    );

    await expect(analyzeContext({ context: "x" })).rejects.toThrow(
      "The server returned an incomplete or unexpected analysis response.",
    );
  });

  it("reports a network failure clearly", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(analyzeContext({ context: "x" })).rejects.toThrow(
      "Network error. Check that the backend is running and reachable, then retry.",
    );
  });
});
