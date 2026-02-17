import express from "express";
import cors from "cors";
import { getEnv } from "./config/env";
import { quizRouter } from "./modules/quiz/quiz.routes";
import { leaderboardRouter } from "./modules/leaderboard/leaderboard.routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

export function createApp() {
  const env = getEnv();
  const app = express();

  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/v1/quiz", quizRouter);
  app.use("/v1/leaderboard", leaderboardRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

