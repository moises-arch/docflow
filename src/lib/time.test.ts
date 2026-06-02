import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatFullTimestamp, formatRelativeTime } from "./time";

const NOW = new Date("2024-06-15T12:00:00Z");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("formatRelativeTime", () => {
  it("returns seconds ago for very recent dates", () => {
    const date = new Date(NOW.getTime() - 30_000).toISOString();
    const result = formatRelativeTime(date, "en");
    expect(result).toMatch(/30 seconds ago/i);
  });

  it("returns minutes ago for dates within the last hour", () => {
    const date = new Date(NOW.getTime() - 5 * 60_000).toISOString();
    const result = formatRelativeTime(date, "en");
    expect(result).toMatch(/5 minutes ago/i);
  });

  it("returns hours ago for dates within the last day", () => {
    const date = new Date(NOW.getTime() - 3 * 3_600_000).toISOString();
    const result = formatRelativeTime(date, "en");
    expect(result).toMatch(/3 hours ago/i);
  });

  it("returns days ago for dates within the last week", () => {
    const date = new Date(NOW.getTime() - 4 * 86_400_000).toISOString();
    const result = formatRelativeTime(date, "en");
    expect(result).toMatch(/4 days ago/i);
  });

  it("returns short date format for dates older than 7 days", () => {
    const date = new Date(NOW.getTime() - 10 * 86_400_000).toISOString();
    const result = formatRelativeTime(date, "en");
    // Should be a short date like "Jun 5"
    expect(result).toMatch(/Jun/i);
  });

  it("respects locale for relative output", () => {
    const date = new Date(NOW.getTime() - 2 * 3_600_000).toISOString();
    const en = formatRelativeTime(date, "en");
    const es = formatRelativeTime(date, "es");
    expect(en).not.toBe(es);
  });
});

describe("formatFullTimestamp", () => {
  it("returns a non-empty string for a valid ISO date", () => {
    const result = formatFullTimestamp("2024-06-15T12:00:00Z", "en");
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });

  it("includes the date and time components", () => {
    const result = formatFullTimestamp("2024-06-15T12:00:00Z", "en-US");
    // Should contain the year and some time indicator
    expect(result).toMatch(/2024/);
  });
});
