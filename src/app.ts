import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { sql } from "drizzle-orm";
import { cors } from "hono/cors";
import { createDb } from "./db";
import { profilesRoutes } from "./features/profiles/profiles.routes";
import { careerGoalsRoutes } from "./features/career-goals/career-goals.routes";
import { missionsRoutes } from "./features/missions/missions.routes";
import { submissionsRoutes } from "./features/submissions/submissions.routes";
import { databaseMiddleware } from "./shared/database";
import { requireAuth } from "./shared/auth";
import type { AppEnv } from "./shared/types";

const app = new OpenAPIHono<AppEnv>();

app.use("*", async (c, next) => {
  const id = crypto.randomUUID();
  c.set("requestId", id);
  await next();
  c.header("X-Request-Id", id);
});
app.use("/api/v1/*", cors({
  origin: (origin, c) => {
    const allowed = c.env.CORS_ORIGINS?.split(",").map((item: string) => item.trim()).filter(Boolean);
    if (!allowed?.length) return "*";
    return allowed.includes(origin) ? origin : "";
  },
  allowHeaders: ["Authorization", "Content-Type"],
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  maxAge: 600,
}));

app.use("/api/v1/*", databaseMiddleware);
app.use("/api/v1/me", requireAuth);
app.use("/api/v1/me/career-goals", requireAuth);
app.use("/api/v1/me/submissions", requireAuth);
app.use("/api/v1/missions/:missionId/submissions", requireAuth);
app.route("/api/v1", profilesRoutes);
app.route("/api/v1", careerGoalsRoutes);
app.route("/api/v1", missionsRoutes);
app.route("/api/v1", submissionsRoutes);

app.onError((error, c) => {
  const requestId = c.get("requestId");
  console.error("Unhandled request error", { requestId, name: error.name });
  return c.json({
    success: false as const,
    error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred.", requestId },
  }, 500);
});

const healthQuerySchema = z.object({
  detailed: z.enum(["true", "false"]).optional(),
});

const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("skillbridge-backend"),
  runtime: z.literal("cloudflare-workers").optional(),
}).openapi("HealthResponse");

const databaseHealthResponseSchema = z.object({
  status: z.literal("ok"),
  database: z.literal("reachable"),
}).openapi("DatabaseHealthResponse");

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  request: { query: healthQuerySchema },
  responses: {
    200: {
      description: "Returns the service health status.",
      content: { "application/json": { schema: healthResponseSchema } },
    },
  },
});

app.openapi(healthRoute, (c) => {
  const { detailed } = c.req.valid("query");

  return c.json({
    status: "ok",
    service: "skillbridge-backend",
    ...(detailed === "true" ? { runtime: "cloudflare-workers" } : {}),
  }, 200);
});

const databaseHealthRoute = createRoute({
  method: "get",
  path: "/health/database",
  responses: {
    200: {
      description: "Confirms PostgreSQL is reachable through Drizzle and Cloudflare Hyperdrive.",
      content: {
        "application/json": {
          schema: databaseHealthResponseSchema,
        },
      },
    },
  },
});

app.openapi(databaseHealthRoute, async (c) => {
  const connectionString = c.env.HYPERDRIVE.connectionString;
  const { db, close } = await createDb(connectionString);
  try {
    await db.execute(sql`SELECT 1`);
    return c.json({ status: "ok", database: "reachable" }, 200);
  } finally {
    await close();
  }
});

app.doc("/openapi.json", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "SkillBridge Backend API",
    description: "OpenAPI schema for the SkillBridge backend.",
  },
});

export { app };
export function getOpenApiDocument() {
  const document = app.getOpenAPIDocument({
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "SkillBridge Backend API",
      description: "Generated API contract for the SkillBridge backend.",
    },
  });
  document.components = {
    ...document.components,
    securitySchemes: {
      BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  };
  return document;
}

export default app;
