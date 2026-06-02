import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type QueryResult<T = unknown> = PromiseLike<{ data: T | null; error: { message?: string } | null }>;

type QueryBuilder<T = unknown> = QueryResult<T> & {
  select: (columns?: string) => QueryBuilder<T>;
  eq: (column: string, value: unknown) => QueryBuilder<T>;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder<T>;
  limit: (count: number) => QueryBuilder<T>;
  not: (column: string, operator: string, value: unknown) => QueryBuilder<T>;
  in: (column: string, values: unknown[]) => QueryBuilder<T>;
  is: (column: string, value: unknown) => QueryBuilder<T>;
  lt: (column: string, value: unknown) => QueryBuilder<T>;
  gte: (column: string, value: unknown) => QueryBuilder<T>;
  insert: (values: unknown) => QueryBuilder<T>;
  update: (values: unknown) => QueryBuilder<T>;
  upsert: (values: unknown, options?: { onConflict?: string }) => QueryBuilder<T>;
  delete: () => QueryBuilder<T>;
  single: () => QueryResult<T>;
  maybeSingle: () => QueryResult<T>;
};

export type DynamicSupabaseClient = {
  from: <T = unknown>(table: string) => QueryBuilder<T>;
};

export function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function cleanOptionalText(value: unknown) {
  const text = cleanText(value);
  return text || null;
}

export function parsePositiveInt(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function getTenantContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: membership } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .single();

  if (!membership?.tenant_id) {
    return { error: NextResponse.json({ error: "No active tenant" }, { status: 403 }) };
  }

  return { supabase: supabase as unknown as DynamicSupabaseClient, tenantId: membership.tenant_id };
}
