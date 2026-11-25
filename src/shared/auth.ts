import { createRemoteJWKSet, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import type { AppEnv, AppRole } from "./types";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(url: string) {
  let jwks = jwksCache.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, jwks);
  }
  return jwks;
}

export function resolveUserRole(appMetadata: unknown): AppRole | null {
  if (appMetadata === undefined) return "student";
  if (typeof appMetadata !== "object" || appMetadata === null || Array.isArray(appMetadata)) return null;

  if (!Object.prototype.hasOwnProperty.call(appMetadata, "role")) return "student";
  return (appMetadata as Record<string, unknown>).role === "student" ? "student" : null;
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const jwksUrl = c.env.SUPABASE_JWKS_URL;
  const issuer = c.env.SUPABASE_ISSUER;
  if (!jwksUrl || !issuer) {
    return c.json({ success: false, error: { code: "AUTH_NOT_CONFIGURED", message: "Authentication is not configured." } }, 503);
  }

  const authorization = c.req.header("Authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
  if (!token) {
    return c.json({ success: false, error: { code: "UNAUTHENTICATED", message: "A Bearer access token is required." } }, 401);
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(jwksUrl), {
      issuer,
      audience: "authenticated",
    });
    if (typeof payload.sub !== "string") throw new Error("JWT subject is missing");
    const role = resolveUserRole(payload.app_metadata);
    if (!role) {
      return c.json({ success: false, error: { code: "ROLE_NOT_ALLOWED", message: "This account role is not enabled for the current MVP." } }, 403);
    }
    c.set("user", { id: payload.sub, role });
    await next();
  } catch {
    return c.json({ success: false, error: { code: "INVALID_TOKEN", message: "The access token is invalid or expired." } }, 401);
  }
};
