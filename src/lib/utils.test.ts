import { describe, expect, it } from "vitest";
import { cn, getInitials } from "./utils";

describe("cn", () => {
  it("merges class strings", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("resolves Tailwind conflicts — last wins", () => {
    expect(cn("p-4", "p-8")).toBe("p-8");
  });

  it("ignores falsy values", () => {
    expect(cn("foo", undefined, false, null as never, "bar")).toBe("foo bar");
  });

  it("supports conditional objects", () => {
    expect(cn({ "font-bold": true, "font-thin": false })).toBe("font-bold");
  });
});

describe("getInitials", () => {
  it("returns first letters of two words", () => {
    expect(getInitials("John Doe")).toBe("JD");
  });

  it("handles email addresses", () => {
    expect(getInitials("john@example.com")).toBe("JE");
  });

  it("handles hyphenated names (split on hyphen, first two parts)", () => {
    expect(getInitials("Jean-Pierre Martin")).toBe("JP");
  });

  it("handles dotted names", () => {
    expect(getInitials("john.doe")).toBe("JD");
  });

  it("returns two chars from a single word", () => {
    expect(getInitials("Alice")).toBe("AL");
  });

  it("returns ?? for empty string", () => {
    expect(getInitials("")).toBe("??");
  });

  it("is always uppercase", () => {
    expect(getInitials("jane doe")).toBe("JD");
  });
});
