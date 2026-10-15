import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResultsDashboard } from "../ResultsDashboard";

describe("ResultsDashboard component", () => {
  const mockOnNewAnalysis = vi.fn();

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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders channel count without trailing whitespace", () => {
    render(<ResultsDashboard result={validResponse} onNewAnalysis={mockOnNewAnalysis} />);

    // Find the channel count element - it should be in the meta-grid
    const channelDt = screen.getByText(/Channels/);
    // Get the next sibling dd element (the dt and dd are siblings in the dl)
    const channelElement = channelDt.nextElementSibling;
    expect(channelElement).toBeInTheDocument();
    expect(channelElement?.textContent).toBe("2");
    expect(channelElement?.textContent).not.toBe("2 ");
  });

  it("renders channel count as 'Not provided' when null", () => {
    const responseWithNullChannel = {
      ...validResponse,
      audio: {
        ...validResponse.audio,
        channel_count: null,
      },
    };

    render(<ResultsDashboard result={responseWithNullChannel} onNewAnalysis={mockOnNewAnalysis} />);

    expect(screen.getByText(/Not provided/)).toBeInTheDocument();
  });

  it("renders all audio validation fields correctly", () => {
    render(<ResultsDashboard result={validResponse} onNewAnalysis={mockOnNewAnalysis} />);

    expect(screen.getByText(/Validated/)).toBeInTheDocument();
    expect(screen.getByText(/Yes/)).toBeInTheDocument();
    expect(screen.getByText(/WAV/)).toBeInTheDocument();
    expect(screen.getByText(/58\.3 s/)).toBeInTheDocument();
    expect(screen.getByText(/44100 Hz/)).toBeInTheDocument();
    const channelDt = screen.getByText(/Channels/);
    const channelElement = channelDt.nextElementSibling;
    expect(channelElement?.textContent).toBe("2");
  });

  it("renders detector status and label", () => {
    render(<ResultsDashboard result={validResponse} onNewAnalysis={mockOnNewAnalysis} />);

    expect(screen.getByText(/Detector status:/)).toBeInTheDocument();
    expect(screen.getByText(/not_configured/)).toBeInTheDocument();
    expect(screen.getByText(/Detector label: unknown/)).toBeInTheDocument();
    expect(screen.getByText(/No detector score available/)).toBeInTheDocument();
  });

  it("renders findings with confidence", () => {
    render(<ResultsDashboard result={validResponse} onNewAnalysis={mockOnNewAnalysis} />);

    expect(screen.getByText(/Urgent action requested/)).toBeInTheDocument();
    expect(screen.getByText(/high · behavioral/)).toBeInTheDocument();
    expect(screen.getByText(/Confidence: 87%/)).toBeInTheDocument();
  });

  it("renders verification guidance", () => {
    render(<ResultsDashboard result={validResponse} onNewAnalysis={mockOnNewAnalysis} />);

    expect(screen.getByText(/Priority: high/)).toBeInTheDocument();
    expect(screen.getByText(/Independently contact the supposed sender/)).toBeInTheDocument();
  });

  it("renders limitations", () => {
    render(<ResultsDashboard result={validResponse} onNewAnalysis={mockOnNewAnalysis} />);

    expect(screen.getByText(/Audio validation confirms technical validity only/)).toBeInTheDocument();
    expect(screen.getByText(/No deepfake detector is currently configured/)).toBeInTheDocument();
  });
});