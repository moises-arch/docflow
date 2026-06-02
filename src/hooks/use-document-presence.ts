"use client";

import { createClient } from "@/lib/supabase/browser";
import { useEffect, useRef, useState } from "react";

export interface PresenceUser {
  userId: string;
  name: string;
  email: string;
  joinedAt: number;
}

function initials(name: string, email: string): string {
  if (name.trim()) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function colorForUserId(userId: string): string {
  const palette = [
    "#6366f1", // indigo
    "#0ea5e9", // sky
    "#10b981", // emerald
    "#f59e0b", // amber
    "#ef4444", // rose
    "#8b5cf6", // violet
    "#06b6d4", // cyan
    "#f97316", // orange
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

export function useDocumentPresence(
  documentId: string,
  currentUser: { id: string; name?: string; email: string },
) {
  const [others, setOthers] = useState<PresenceUser[]>([]);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`document-presence:${documentId}`, {
      config: { presence: { key: currentUser.id } },
    });
    channelRef.current = channel;

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<{
        userId: string;
        name: string;
        email: string;
        joinedAt: number;
      }>();
      const all = Object.values(state).flat();
      setOthers(all.filter((u) => u.userId !== currentUser.id));
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          userId: currentUser.id,
          name: currentUser.name ?? "",
          email: currentUser.email,
          joinedAt: Date.now(),
        });
      }
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [documentId, currentUser.id, currentUser.name, currentUser.email]);

  return { others, initials, colorForUserId };
}
