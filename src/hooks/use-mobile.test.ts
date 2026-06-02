import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIsMobile } from "./use-mobile";

function mockMatchMedia(matches: boolean) {
  const listeners: Array<() => void> = [];
  const mql = {
    matches,
    addEventListener: vi.fn((_: string, cb: () => void) => listeners.push(cb)),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    _fire: () => listeners.forEach((cb) => cb()),
  };
  Object.defineProperty(window, "matchMedia", { writable: true, value: vi.fn(() => mql) });
  Object.defineProperty(window, "innerWidth", { writable: true, value: matches ? 375 : 1024 });
  return mql;
}

describe("useIsMobile", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns false on desktop viewport", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true on mobile viewport", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("updates when viewport changes to mobile", () => {
    const mql = mockMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      Object.defineProperty(window, "innerWidth", { writable: true, value: 375 });
      mql._fire();
    });

    expect(result.current).toBe(true);
  });

  it("removes the matchMedia listener on unmount", () => {
    const mql = mockMatchMedia(false);
    const { unmount } = renderHook(() => useIsMobile());
    unmount();
    expect(mql.removeEventListener).toHaveBeenCalledOnce();
  });

  it("never returns undefined (always coerced to boolean)", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useIsMobile());
    expect(typeof result.current).toBe("boolean");
  });
});
