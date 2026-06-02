import { describe, expect, it } from "vitest";
import { computeNextCron } from "./cron-schedule";

describe("computeNextCron", () => {
  it("returns next 3am UTC when called at 2:59am UTC", () => {
    const now = new Date("2026-05-21T02:59:00Z");
    const next = computeNextCron(now);
    expect(next.toISOString()).toBe("2026-05-21T03:00:00.000Z");
  });

  it("returns next day 3am UTC when called at 3:01am UTC", () => {
    const now = new Date("2026-05-21T03:01:00Z");
    const next = computeNextCron(now);
    expect(next.toISOString()).toBe("2026-05-22T03:00:00.000Z");
  });

  it("returns same day 3am UTC when called at midnight UTC", () => {
    const now = new Date("2026-05-21T00:00:00Z");
    const next = computeNextCron(now);
    expect(next.toISOString()).toBe("2026-05-21T03:00:00.000Z");
  });

  it("handles month boundary correctly", () => {
    const now = new Date("2026-05-31T15:00:00Z");
    const next = computeNextCron(now);
    expect(next.toISOString()).toBe("2026-06-01T03:00:00.000Z");
  });

  it("handles year boundary correctly", () => {
    const now = new Date("2026-12-31T23:59:59Z");
    const next = computeNextCron(now);
    expect(next.toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });
});
