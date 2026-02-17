import { Router } from "express";
import { getScoreLeaderboard, getStreakLeaderboard } from "./leaderboard.service";

export const leaderboardRouter = Router();

// GET /v1/leaderboard/score
leaderboardRouter.get("/score", async (_req, res) => {
  const items = await getScoreLeaderboard(20);
  res.json({ items });
});

// GET /v1/leaderboard/streak
leaderboardRouter.get("/streak", async (_req, res) => {
  const items = await getStreakLeaderboard(20);
  res.json({ items });
});

