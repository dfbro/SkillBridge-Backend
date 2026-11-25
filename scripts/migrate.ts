import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const connectionString = process.env.DATABASE_URL
  ?? "postgresql://skillbridge_migrator@127.0.0.1:5432/skillbridge_dev";
const client = new Client({ connectionString });

try {
  await client.connect();
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  process.stdout.write("Database migrations applied successfully.\n");
} finally {
  await client.end();
}
