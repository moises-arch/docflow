/** Typed wrapper around Deno.env — fails fast on missing required secrets */
export function requireEnv(key: string): string {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function requireFirstEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = Deno.env.get(key);
    if (value) return value;
  }
  throw new Error(`Missing required env var: ${keys.join(" or ")}`);
}

export const secrets = {
  get intakeSecretsKey() {
    return requireEnv("INTAKE_SECRETS_KEY");
  },
  get anthropicApiKey() {
    return Deno.env.get("ANTHROPIC_API_KEY") ?? null;
  },
  get anthropicPrimaryModel() {
    return "claude-sonnet-4-6";
  },
  get anthropicFallbackModel() {
    return null;
  },
  get supabaseUrl() {
    return requireFirstEnv("INTAKE_SUPABASE_URL", "SUPABASE_URL");
  },
  get supabaseServiceKey() {
    return requireFirstEnv("INTAKE_SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY");
  },
};
