import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("app navigation", () => {
  it("defaults to the voice analysis dashboard and can open context review", async () => {
    const user = userEvent.setup();
    render(<App />);

    // Voice analysis dashboard is the primary default view.
    expect(
      screen.getByRole("heading", { name: "VeriVoice AI" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Voice analysis" })).toBeTruthy();

    // Context review is reachable via navigation and renders its own UI.
    await user.click(screen.getByRole("button", { name: "Context review" }));
    expect(
      screen.getByRole("heading", { name: "Pause. Check the request." }),
    ).toBeTruthy();
    expect(
      screen.getByLabelText("Call or message context"),
    ).toBeTruthy();
  });
});
