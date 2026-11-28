import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export async function createDb(connectionString: string) {
  const client = new Client({ connectionString });
  await client.connect();
  // Hyperdrive owns the origin connection pool and Workers clean up the
  // per-invocation client connection automatically. Do not call client.end().
  return drizzle(client, { schema });
}
