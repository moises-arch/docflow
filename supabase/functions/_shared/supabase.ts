import { createClient } from "npm:@supabase/supabase-js@2";
import { secrets } from "./secrets.ts";

/** Service-role Supabase client — bypasses RLS. */
export function createServiceClient() {
  return createClient(secrets.supabaseUrl, secrets.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
