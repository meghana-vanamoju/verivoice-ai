import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import * as apiModule from "../services/api";

const validResponse = {
  analysis_id: "c5f8e2d1-3a7b-4e8c-9f1a-2b6d5e7f8a9c",
  status: "completed" as const,
  risk: {
    score: 72,
    level: "high" as const,
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
      status: "not_configured" as const,
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

class MockApiRequestError extends Error {
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

describe("App component", () => {
  let mockAnalyzeAudio: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    mockAnalyzeAudio = vi.spyOn(apiModule, "analyzeAudio");
  });

  it("shows validation error when audio is missing on submit", async () => {
    const user = userEvent.setup();
    render(<App />);

    const contextTextarea = screen.getByLabelText(/communication context/i);
    await user.type(contextTextarea, "Urgent money request from CEO");

    const submitButton = screen.getByRole("button", { name: /analyze/i });
    await user.click(submitButton);

    const audioError = screen.getByText(/please select a wav audio file/i);
    expect(audioError).toBeInTheDocument();
    expect(mockAnalyzeAudio).not.toHaveBeenCalled();
  });

  it("shows validation error when context is missing on submit", async () => {
    const user = userEvent.setup();
    render(<App />);

    const file = new File(["audio content"], "test.wav", { type: "audio/wav" });
    const audioInput = screen.getByLabelText(/audio file/i).parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(audioInput, file);

    const submitButton = screen.getByRole("button", { name: /analyze/i });
    await user.click(submitButton);

    const contextError = screen.getByText(/context is required/i);
    expect(contextError).toBeInTheDocument();
    expect(mockAnalyzeAudio).not.toHaveBeenCalled();
  });

  it("associates context error with control via aria-describedby", async () => {
    const user = userEvent.setup();
    render(<App />);

    const submitButton = screen.getByRole("button", { name: /analyze/i });
    await user.click(submitButton);

    const contextTextarea = screen.getByLabelText(/communication context/i);
    expect(contextTextarea).toHaveAttribute("aria-describedby", "context-help");
  });

  it("calls analyzeAudio with selected file and context on valid submit", async () => {
    const user = userEvent.setup();
    mockAnalyzeAudio.mockResolvedValueOnce(validResponse);

    render(<App />);

    const file = new File(["audio content"], "test.wav", { type: "audio/wav" });
    const audioInput = screen.getByLabelText(/audio file/i).parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(audioInput, file);

    const contextTextarea = screen.getByLabelText(/communication context/i);
    await user.type(contextTextarea, "Urgent money request from CEO");

    const submitButton = screen.getByRole("button", { name: /analyze/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockAnalyzeAudio).toHaveBeenCalledTimes(1);
    });

    const callArgs = mockAnalyzeAudio.mock.calls[0][0];
    expect(callArgs.audio).toBe(file);
    expect(callArgs.context).toBe("Urgent money request from CEO");
    expect(callArgs.transcript).toBe("");
    expect(callArgs.language).toBe("");
  });

  it("calls analyzeAudio with transcript and language when provided", async () => {
    const user = userEvent.setup();
    mockAnalyzeAudio.mockResolvedValueOnce(validResponse);

    render(<App />);

    const file = new File(["audio content"], "test.wav", { type: "audio/wav" });
    const audioInput = screen.getByLabelText(/audio file/i).parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(audioInput, file);

    const contextTextarea = screen.getByLabelText(/communication context/i);
    await user.type(contextTextarea, "Urgent money request");

    const transcriptTextarea = screen.getByLabelText(/transcript/i);
    await user.type(transcriptTextarea, "Transfer the money now.");

    const languageInput = screen.getByLabelText(/language/i);
    await user.type(languageInput, "en-US");

    const submitButton = screen.getByRole("button", { name: /analyze/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockAnalyzeAudio).toHaveBeenCalledTimes(1);
    });

    const callArgs = mockAnalyzeAudio.mock.calls[0][0];
    expect(callArgs.transcript).toBe("Transfer the money now.");
    expect(callArgs.language).toBe("en-US");
  });

  it("renders ResultsDashboard on successful API response", async () => {
    const user = userEvent.setup();
    mockAnalyzeAudio.mockResolvedValueOnce(validResponse);

    render(<App />);

    const file = new File(["audio content"], "test.wav", { type: "audio/wav" });
    const audioInput = screen.getByLabelText(/audio file/i).parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(audioInput, file);

    const contextTextarea = screen.getByLabelText(/communication context/i);
    await user.type(contextTextarea, "Urgent money request from CEO");

    const submitButton = screen.getByRole("button", { name: /analyze/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/analysis results/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/analysis reference:/i)).toBeInTheDocument();
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByText("HIGH")).toBeInTheDocument();
  });

  it("displays useful error message for structured ApiRequestError", async () => {
    const user = userEvent.setup();
    mockAnalyzeAudio.mockRejectedValueOnce(new MockApiRequestError("Audio file is malformed.", 400, "malformed_audio"));

    render(<App />);

    const file = new File(["audio content"], "test.wav", { type: "audio/wav" });
    const audioInput = screen.getByLabelText(/audio file/i).parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(audioInput, file);

    const contextTextarea = screen.getByLabelText(/communication context/i);
    await user.type(contextTextarea, "Urgent money request from CEO");

    const submitButton = screen.getByRole("button", { name: /analyze/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/audio file is malformed\./i)).toBeInTheDocument();
    });
  });

  it("displays generic error message for ApiRequestError without message", async () => {
    const user = userEvent.setup();
    // Use an error with message that will be displayed
    mockAnalyzeAudio.mockRejectedValueOnce(new MockApiRequestError("An unexpected error occurred. Please retry.", 500, "internal_error"));

    render(<App />);

    const file = new File(["audio content"], "test.wav", { type: "audio/wav" });
    const audioInput = screen.getByLabelText(/audio file/i).parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(audioInput, file);

    const contextTextarea = screen.getByLabelText(/communication context/i);
    await user.type(contextTextarea, "Urgent money request from CEO");

    const submitButton = screen.getByRole("button", { name: /analyze/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("displays generic error message for non-ApiRequestError", async () => {
    const user = userEvent.setup();
    mockAnalyzeAudio.mockRejectedValueOnce(new Error("Network failure"));

    render(<App />);

    const file = new File(["audio content"], "test.wav", { type: "audio/wav" });
    const audioInput = screen.getByLabelText(/audio file/i).parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(audioInput, file);

    const contextTextarea = screen.getByLabelText(/communication context/i);
    await user.type(contextTextarea, "Urgent money request from CEO");

    const submitButton = screen.getByRole("button", { name: /analyze/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/network failure/i);
    });
  });

  it("disables controls during analysis", async () => {
    const user = userEvent.setup();
    let resolveAnalysis: (value: typeof validResponse) => void;
    const analysisPromise = new Promise<typeof validResponse>((resolve) => {
      resolveAnalysis = resolve;
    });
    mockAnalyzeAudio.mockReturnValueOnce(analysisPromise);

    render(<App />);

    const file = new File(["audio content"], "test.wav", { type: "audio/wav" });
    const audioInput = screen.getByLabelText(/audio file/i).parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(audioInput, file);

    const contextTextarea = screen.getByLabelText(/communication context/i);
    await user.type(contextTextarea, "Urgent money request from CEO");

    // Click the Analyze button which triggers the analysis
    const submitButton = screen.getByRole("button", { name: /analyze/i });
    await act(async () => {
      await user.click(submitButton);
    });

    // After click, the status should be "analyzing" and button should show "Analyzing..."
    const analyzingButton = screen.getByRole("button", { name: /analyzing\.\.\./i });

    // Check that controls are disabled during analysis
    expect(analyzingButton).toBeDisabled();
    expect(contextTextarea).toBeDisabled();
    expect(audioInput).toBeDisabled();

    const resetButton = screen.getByRole("button", { name: /reset/i });
    expect(resetButton).toBeDisabled();

    // Complete the analysis
    await act(async () => {
      resolveAnalysis!(validResponse);
    });
    await waitFor(() => {
      expect(screen.getByText(/analysis results/i)).toBeInTheDocument();
    });
  });

  it("prevents duplicate submission during analysis", async () => {
    const user = userEvent.setup();
    let resolveAnalysis: (value: typeof validResponse) => void;
    const analysisPromise = new Promise<typeof validResponse>((resolve) => {
      resolveAnalysis = resolve;
    });
    mockAnalyzeAudio.mockReturnValueOnce(analysisPromise);

    render(<App />);

    const file = new File(["audio content"], "test.wav", { type: "audio/wav" });
    const audioInput = screen.getByLabelText(/audio file/i).parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(audioInput, file);

    const contextTextarea = screen.getByLabelText(/communication context/i);
    await user.type(contextTextarea, "Urgent money request from CEO");

    const submitButton = screen.getByRole("button", { name: /analyze/i });
    await act(async () => {
      await user.click(submitButton);
    });

    // Wait for the button to be disabled (status changed to analyzing)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /analyzing\.\.\./i })).toBeDisabled();
    });

    // Try to click again while analyzing - should not trigger another call
    await act(async () => {
      await user.click(submitButton);
    });

    expect(mockAnalyzeAudio).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveAnalysis!(validResponse);
    });
  });

  it("shows status live region during analysis", async () => {
    const user = userEvent.setup();
    let resolveAnalysis: (value: typeof validResponse) => void;
    const analysisPromise = new Promise<typeof validResponse>((resolve) => {
      resolveAnalysis = resolve;
    });
    mockAnalyzeAudio.mockReturnValueOnce(analysisPromise);

    render(<App />);

    const file = new File(["audio content"], "test.wav", { type: "audio/wav" });
    const audioInput = screen.getByLabelText(/audio file/i).parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(audioInput, file);

    const contextTextarea = screen.getByLabelText(/communication context/i);
    await user.type(contextTextarea, "Urgent money request from CEO");

    // Click the Analyze button which triggers the analysis
    const submitButton = screen.getByRole("button", { name: /analyze/i });
    await act(async () => {
      await user.click(submitButton);
    });

    // Wait for the status live region to appear
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/uploading and analyzing audio/i);
    });

    await act(async () => {
      resolveAnalysis!(validResponse);
    });
  });

  it("reset button clears form and returns to ready state", async () => {
    const user = userEvent.setup();
    mockAnalyzeAudio.mockResolvedValueOnce(validResponse);

    render(<App />);

    const file = new File(["audio content"], "test.wav", { type: "audio/wav" });
    const audioInput = screen.getByLabelText(/audio file/i).parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(audioInput, file);

    const contextTextarea = screen.getByLabelText(/communication context/i);
    await user.type(contextTextarea, "Urgent money request from CEO");

    const submitButton = screen.getByRole("button", { name: /analyze/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/analysis results/i)).toBeInTheDocument();
    });

    // Click "New analysis" button (which is the same as handleNewAnalysis)
    const newAnalysisButton = screen.getByRole("button", { name: /new analysis/i });
    await user.click(newAnalysisButton);

    // Form should be reset
    expect(screen.getByRole("button", { name: /analyze/i })).toBeInTheDocument();
    expect(screen.queryByText(/analysis results/i)).not.toBeInTheDocument();
  });

  it("handles file size validation error", async () => {
    const user = userEvent.setup();
    render(<App />);

    const largeFile = new File(["x".repeat(16 * 1024 * 1024)], "large.wav", { type: "audio/wav" });
    const audioInput = screen.getByLabelText(/audio file/i).parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(audioInput, largeFile);

    const audioError = screen.getByText(/file exceeds the 15 mb limit/i);
    expect(audioError).toBeInTheDocument();

    // The file should not be selected
    const contextTextarea = screen.getByLabelText(/communication context/i);
    await user.type(contextTextarea, "Urgent money request from CEO");

    const submitButton = screen.getByRole("button", { name: /analyze/i });
    await user.click(submitButton);

    expect(screen.getByText(/please select a wav audio file/i)).toBeInTheDocument();
  });
});