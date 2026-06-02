/**
 * Service-role client — bypasses RLS.
 * NEVER import this in React components or client-side code.
 * Used only in Edge Functions and server actions that have already
 * verified tenant_id from a trusted source.
 */
import { createClient as _createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase service role env vars");
  }

  return _createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
