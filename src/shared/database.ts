import type { MiddlewareHandler } from "hono";
import { createDb } from "../db";
import type { AppEnv } from "./types";

export const databaseMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const db = await createDb(c.env.HYPERDRIVE.connectionString);
  c.set("db", db);
  await next();
};
