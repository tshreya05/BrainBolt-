import Redis from "ioredis";
import { getEnv } from "../config/env";

const env = getEnv();

export const redis = new Redis(env.REDIS_URL, {
  // Keep defaults; ioredis reconnects automatically
  maxRetriesPerRequest: 3
});

export async function checkRedisConnection(): Promise<void> {
  const pong = await redis.ping();
  if (pong !== "PONG") {
    throw new Error("Redis ping failed");
  }
}

