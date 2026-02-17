import { Pool } from "pg";
import { getEnv } from "../config/env";

const env = getEnv();

export const pgPool = new Pool({
  connectionString: env.DATABASE_URL
});

export async function checkPostgresConnection(): Promise<void> {
  const client = await pgPool.connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}

