import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(1800),
  DIFFICULTY_MIN: z.coerce.number().int().min(1).max(10).default(1),
  DIFFICULTY_MAX: z.coerce.number().int().min(1).max(10).default(10)
});

export type Env = z.infer<typeof EnvSchema>;

export function getEnv(): Env {
  // dotenv is loaded in server.ts (entrypoint)
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Fail fast in a beginner-friendly way
    // eslint-disable-next-line no-console
    console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }
  return parsed.data;
}

