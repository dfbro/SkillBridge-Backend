import type { createDb } from "../db";

export type AppEnv = {
  Bindings: CloudflareBindings & {
    SUPABASE_JWKS_URL?: string;
    SUPABASE_ISSUER?: string;
    CORS_ORIGINS?: string;
    PROGRESSION_POLICY_JSON?: string;
  };
  Variables: {
    user: { id: string; role: string };
    db: Awaited<ReturnType<typeof createDb>>["db"];
    requestId: string;
  };
};
