import { createRemoteJWKSet, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./types";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(url: string) {
  let jwks = jwksCache.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, jwks);
  }
  return jwks;
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
    const appMetadata = payload.app_metadata;
    const role = typeof appMetadata === "object" && appMetadata !== null && "role" in appMetadata && typeof appMetadata.role === "string"
      ? appMetadata.role
      : "student";
    c.set("user", { id: payload.sub, role });
    await next();
  } catch {
    return c.json({ success: false, error: { code: "INVALID_TOKEN", message: "The access token is invalid or expired." } }, 401);
  }
};
