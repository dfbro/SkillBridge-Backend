import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";
import { profiles } from "../../db/schema";
import type { AppEnv } from "../../shared/types";
import { profileResponseSchema, updateProfileSchema } from "./profiles.schemas";

export const profilesRoutes = new OpenAPIHono<AppEnv>();

const unauthorizedSchema = z.object({
  success: z.literal(false),
  error: z.object({ code: z.string(), message: z.string() }),
});

const getMeRoute = createRoute({
  method: "get",
  path: "/me",
  tags: ["Profiles"],
  summary: "Get the authenticated user's profile",
  security: [{ BearerAuth: [] }],
  responses: {
    200: { description: "Profile retrieved", content: { "application/json": { schema: profileResponseSchema } } },
    401: { description: "Missing or invalid access token", content: { "application/json": { schema: unauthorizedSchema } } },
    503: { description: "Supabase authentication is not configured", content: { "application/json": { schema: unauthorizedSchema } } },
  },
});

profilesRoutes.openapi(getMeRoute, async (c) => {
  const user = c.get("user");
  const db = c.get("db");
  await db.insert(profiles).values({ id: user.id }).onConflictDoNothing();
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);
  if (!profile) return c.json({ success: false, error: { code: "PROFILE_NOT_FOUND", message: "Profile could not be initialized." } }, 503);
  return c.json({
    success: true as const,
    data: {
      id: profile.id,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    },
  }, 200);
});

const patchMeRoute = createRoute({
  method: "patch",
  path: "/me",
  tags: ["Profiles"],
  summary: "Update the authenticated user's profile",
  security: [{ BearerAuth: [] }],
  request: { body: { required: true, content: { "application/json": { schema: updateProfileSchema } } } },
  responses: {
    200: { description: "Profile updated", content: { "application/json": { schema: profileResponseSchema } } },
    400: { description: "Invalid request body", content: { "application/json": { schema: unauthorizedSchema } } },
    401: { description: "Missing or invalid access token", content: { "application/json": { schema: unauthorizedSchema } } },
    503: { description: "Supabase authentication is not configured", content: { "application/json": { schema: unauthorizedSchema } } },
  },
});

profilesRoutes.openapi(patchMeRoute, async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const db = c.get("db");
  await db.insert(profiles).values({ id: user.id }).onConflictDoNothing();
  const [profile] = await db.update(profiles)
    .set({
      ...(body.displayName !== undefined ? { displayName: body.displayName } : {}),
      ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
      ...(body.bio !== undefined ? { bio: body.bio } : {}),
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, user.id))
    .returning();
  return c.json({
    success: true as const,
    data: {
      id: profile.id,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    },
  }, 200);
});
