import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextReview } from "../ContextReview";
import type { ContextAnalysisResult } from "../../types/context-analysis";

const { analyzeContext } = vi.hoisted(() => ({
  analyzeContext: vi.fn(),
}));

vi.mock("../../services/context-analysis", () => ({ analyzeContext }));

const sampleResult: ContextAnalysisResult = {
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

describe("context review form", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    analyzeContext.mockReset();
  });

  it("submits both fields and displays explainable results", async () => {
    analyzeContext.mockResolvedValue(sampleResult);
    render(<ContextReview />);

    fireEvent.change(screen.getByLabelText("Call or message context"), {
      target: { value: "A supplier called about an invoice." },
    });
    fireEvent.change(screen.getByLabelText("Transcript (optional)"), {
      target: { value: "Please wire the funds." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Analyze communication" }));

    await waitFor(() => {
      expect(analyzeContext).toHaveBeenCalledWith({
        context: "A supplier called about an invoice.",
        transcript: "Please wire the funds.",
      });
    });
    expect(await screen.findByText("Moderate")).toBeTruthy();
    expect(screen.getByText("“wire the funds”")).toBeTruthy();
    expect(screen.getByText(sampleResult.guidance[0])).toBeTruthy();
  });

  it("shows the analysis error instead of hiding it", async () => {
    analyzeContext.mockRejectedValue(new Error("Analysis service unavailable"));
    render(<ContextReview />);
    fireEvent.change(screen.getByLabelText("Call or message context"), {
      target: { value: "A caller made a request." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Analyze communication" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Analysis service unavailable");
  });
});
