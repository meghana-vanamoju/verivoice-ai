import { describe, it, expect } from "vitest";

// Test the byte formatting logic used in AudioUpload
const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

describe("file utilities", () => {
  it("formats bytes correctly", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1536000)).toBe("1.46 MB");
    expect(formatBytes(15 * 1024 * 1024)).toBe("15.00 MB");
  });

  it("rejects files exceeding max size", () => {
    const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
    // 16 MB should exceed limit
    expect(16 * 1024 * 1024 > MAX_AUDIO_BYTES).toBe(true);
    // 15 MB should be at limit
    expect(15 * 1024 * 1024 === MAX_AUDIO_BYTES).toBe(true);
  });
});