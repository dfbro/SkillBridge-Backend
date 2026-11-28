import type { createDb } from "../db";

export type AppRole = "student";

export type AppEnv = {
  Bindings: CloudflareBindings & {
    SUPABASE_JWKS_URL?: string;
    SUPABASE_ISSUER?: string;
    PROGRESSION_POLICY_JSON?: string;
  };
  Variables: {
    user: { id: string; role: AppRole };
    db: Awaited<ReturnType<typeof createDb>>;
    requestId: string;
  };
};
