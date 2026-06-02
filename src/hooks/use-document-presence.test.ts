import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDocumentPresence } from "./use-document-presence";

vi.mock("@/lib/supabase/browser", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/browser";

const mockCreateClient = vi.mocked(createClient);

function makePresenceChannel() {
  let syncCallback: (() => void) | null = null;
  let subscribeCallback: ((status: string) => Promise<void>) | null = null;
  const presenceData: Record<string, unknown[]> = {};

  const channel = {
    on: vi.fn().mockImplementation((_type: string, _opts: unknown, cb: () => void) => {
      syncCallback = cb;
      return channel;
    }),
    subscribe: vi.fn().mockImplementation((cb: (s: string) => Promise<void>) => {
      subscribeCallback = cb;
      return channel;
    }),
    track: vi.fn().mockResolvedValue({}),
    presenceState: vi.fn().mockImplementation(() => presenceData),
    _triggerSync: (data: Record<string, unknown[]>) => {
      Object.assign(presenceData, data);
      syncCallback?.();
    },
    _triggerSubscribed: async () => {
      await subscribeCallback?.("SUBSCRIBED");
    },
  };

  return channel;
}

const CURRENT_USER = { id: "user-1", name: "Alice Smith", email: "alice@example.com" };

describe("useDocumentPresence", () => {
  let channel: ReturnType<typeof makePresenceChannel>;
  let mockRemoveChannel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    channel = makePresenceChannel();
    mockRemoveChannel = vi.fn();
    mockCreateClient.mockReturnValue({
      channel: vi.fn().mockReturnValue(channel),
      removeChannel: mockRemoveChannel,
    } as never);
  });

  it("initializes with empty others list", () => {
    const { result } = renderHook(() => useDocumentPresence("doc-1", CURRENT_USER));
    expect(result.current.others).toEqual([]);
  });

  it("creates channel with correct key", () => {
    renderHook(() => useDocumentPresence("doc-42", CURRENT_USER));
    const supabase = mockCreateClient.mock.results[0].value;
    expect(supabase.channel).toHaveBeenCalledWith(
      "document-presence:doc-42",
      expect.objectContaining({ config: { presence: { key: CURRENT_USER.id } } }),
    );
  });

  it("tracks user data after SUBSCRIBED event", async () => {
    renderHook(() => useDocumentPresence("doc-1", CURRENT_USER));
    await act(async () => {
      await channel._triggerSubscribed();
    });
    expect(channel.track).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: CURRENT_USER.id,
        name: CURRENT_USER.name,
        email: CURRENT_USER.email,
      }),
    );
  });

  it("excludes current user from others list on sync", async () => {
    const { result } = renderHook(() => useDocumentPresence("doc-1", CURRENT_USER));

    act(() => {
      channel._triggerSync({
        "user-1": [
          { userId: "user-1", name: "Alice Smith", email: "alice@example.com", joinedAt: 1 },
        ],
        "user-2": [{ userId: "user-2", name: "Bob Jones", email: "bob@example.com", joinedAt: 2 }],
      });
    });

    expect(result.current.others).toHaveLength(1);
    expect(result.current.others[0].userId).toBe("user-2");
  });

  it("shows all remote users when multiple are present", async () => {
    const { result } = renderHook(() => useDocumentPresence("doc-1", CURRENT_USER));

    act(() => {
      channel._triggerSync({
        "user-2": [{ userId: "user-2", name: "Bob", email: "bob@example.com", joinedAt: 1 }],
        "user-3": [{ userId: "user-3", name: "Carol", email: "carol@example.com", joinedAt: 2 }],
      });
    });

    expect(result.current.others).toHaveLength(2);
  });

  it("removes channel on unmount", () => {
    const { unmount } = renderHook(() => useDocumentPresence("doc-1", CURRENT_USER));
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalledOnce();
  });

  it("exposes initials and colorForUserId helpers", () => {
    const { result } = renderHook(() => useDocumentPresence("doc-1", CURRENT_USER));
    expect(result.current.initials("Alice Smith", "alice@example.com")).toBe("AS");
    expect(result.current.colorForUserId("user-1")).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("falls back to email initials when name is empty", () => {
    const { result } = renderHook(() => useDocumentPresence("doc-1", CURRENT_USER));
    expect(result.current.initials("", "bob@example.com")).toBe("BO");
  });
});
