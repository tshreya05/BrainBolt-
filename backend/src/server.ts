import dotenv from "dotenv";
dotenv.config();

import { createApp } from "./app";
import { getEnv } from "./config/env";
import { checkPostgresConnection } from "./db/pool";
import { checkRedisConnection } from "./redis/client";

async function main() {
  const env = getEnv();

  // Fail fast if dependencies are not reachable.
  await checkPostgresConnection();
  await checkRedisConnection();

  const app = createApp();
  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`BrainBolt backend listening on :${env.PORT}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", err);
  process.exit(1);
});

