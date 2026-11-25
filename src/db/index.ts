import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export async function createDb(connectionString: string) {
  const client = new Client({ connectionString });
  await client.connect();
  return {
    db: drizzle(client, { schema }),
    close: () => client.end(),
  };
}
