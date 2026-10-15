import { describe, it, expect } from "vitest";
import { ApiRequestError } from "../api";

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
});