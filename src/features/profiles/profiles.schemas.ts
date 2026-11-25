import { z } from "@hono/zod-openapi";

export const profileSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().max(120).nullable(),
  avatarUrl: z.string().url().nullable(),
  bio: z.string().max(500).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).openapi("Profile");

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  bio: z.string().trim().max(500).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field must be provided").openapi("UpdateProfileRequest");

export const profileResponseSchema = z.object({
  success: z.literal(true),
  data: profileSchema,
}).openapi("ProfileResponse");
