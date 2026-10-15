import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { THEME_STORAGE_KEY } from "../theme";

type ChangeListener = (event: { matches: boolean }) => void;

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<ChangeListener>();
  const mediaQueryList = {
    matches,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_type: string, listener: ChangeListener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: ChangeListener) => {
      listeners.delete(listener);
    },
    addListener: (listener: ChangeListener) => listeners.add(listener),
    removeListener: (listener: ChangeListener) => listeners.delete(listener),
    dispatchEvent: () => false,
  };
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mediaQueryList));
  return mediaQueryList;
}

function currentTheme(): string | null {
  return document.documentElement.getAttribute("data-theme");
}

describe("theme system", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute("data-theme");
  });

  it("toggles the theme and persists the explicit choice", async () => {
    stubMatchMedia(false);
    const user = userEvent.setup();
    render(<App />);

    expect(currentTheme()).toBe("light");

    await user.click(screen.getByRole("button", { name: /switch to dark theme/i }));
    expect(currentTheme()).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    await user.click(screen.getByRole("button", { name: /switch to light theme/i }));
    expect(currentTheme()).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("uses a saved preference on load", () => {
    stubMatchMedia(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    render(<App />);

    expect(currentTheme()).toBe("dark");
    expect(
      screen.getByRole("button", { name: /switch to light theme/i }),
    ).toBeInTheDocument();
  });

  it("respects the system preference when nothing is saved", () => {
    stubMatchMedia(true);

    render(<App />);

    expect(currentTheme()).toBe("dark");
    expect(
      screen.getByRole("button", { name: /switch to light theme/i }),
    ).toBeInTheDocument();
  });
});
