"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export type NotificationSeverity = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  source: string;
  source_id: string | null;
  severity: NotificationSeverity;
  title: string;
  description: string | null;
  href: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
}

export interface UseNotificationsOptions {
  limit?: number;
  unreadOnly?: boolean;
  severity?: NotificationSeverity[];
  source?: string[];
  search?: string;
  tenantId?: string;
}

export function useNotifications(opts: UseNotificationsOptions = {}) {
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const buildUrl = useCallback(
    (before?: string) => {
      const params = new URLSearchParams();
      if (opts.limit) params.set("limit", String(opts.limit));
      if (opts.unreadOnly) params.set("unread_only", "true");
      if (opts.severity?.length) params.set("severity", opts.severity.join(","));
      if (opts.source?.length) params.set("source", opts.source.join(","));
      if (opts.search) params.set("search", opts.search);
      if (before) params.set("before", before);
      return `/api/notifications?${params.toString()}`;
    },
    [opts.limit, opts.unreadOnly, opts.severity, opts.source, opts.search],
  );

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(buildUrl());
      if (!res.ok) return;
      const body = (await res.json()) as { items: Notification[]; cursor: string | null };
      setItems(body.items);
      setCursor(body.cursor);
      setHasMore(body.cursor !== null);
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    const res = await fetch(buildUrl(cursor));
    if (!res.ok) return;
    const body = (await res.json()) as { items: Notification[]; cursor: string | null };
    setItems((prev) => [...prev, ...body.items]);
    setCursor(body.cursor);
    setHasMore(body.cursor !== null);
  }, [cursor, buildUrl]);

  const fetchCount = useCallback(async () => {
    const res = await fetch("/api/notifications/count");
    if (!res.ok) return;
    const body = (await res.json()) as { unread: number };
    setUnreadCount(body.unread);
  }, []);

  const markRead = useCallback(async (id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
  }, []);

  const markAllRead = useCallback(async () => {
    setItems((prev) =>
      prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })),
    );
    setUnreadCount(0);
    await fetch("/api/notifications/read-all", { method: "POST" });
  }, []);

  useEffect(() => {
    void fetchItems();
    void fetchCount();
  }, [fetchItems, fetchCount]);

  useEffect(() => {
    if (!opts.tenantId) return;

    // Channel name único por instancia para evitar colisión entre múltiples
    // consumidores del hook (ej: bell del header + página /notificaciones).
    // Si dos instancias usan el mismo nombre, Supabase rechaza la 2da con
    // "cannot add postgres_changes callbacks after subscribe()".
    const instanceId = Math.random().toString(36).slice(2, 10);
    const channelName = `notifications:${opts.tenantId}:${instanceId}`;

    const supabase = createClient();
    const channel = supabase.channel(channelName);

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `tenant_id=eq.${opts.tenantId}`,
      },
      (payload) => {
        const newRow = payload.new as Omit<Notification, "read_at">;
        setItems((prev) => [{ ...newRow, read_at: null }, ...prev]);
        setUnreadCount((c) => c + 1);
      },
    );

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [opts.tenantId]);

  return { items, unreadCount, loading, hasMore, loadMore, markRead, markAllRead, refresh: fetchItems };
}
