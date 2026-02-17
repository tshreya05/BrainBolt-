import { pgPool } from "../../db/pool";
import { redis } from "../../redis/client";

export type LeaderboardItem = {
  rank: number;
  userId: string;
  value: number;
};

async function zsetTop(key: string, limit: number): Promise<LeaderboardItem[]> {
  const raw = await redis.zrevrange(key, 0, limit - 1, "WITHSCORES");
  const items: LeaderboardItem[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const userId = raw[i]!;
    const score = Number(raw[i + 1] ?? 0);
    items.push({ rank: items.length + 1, userId, value: score });
  }
  return items;
}

export async function getScoreLeaderboard(limit = 20): Promise<LeaderboardItem[]> {
  const cached = await zsetTop("bb:lb:score", limit);
  if (cached.length > 0) return cached;

  const { rows } = await pgPool.query(
    `SELECT user_id, total_score
     FROM leaderboard_score
     ORDER BY total_score DESC
     LIMIT $1`,
    [limit]
  );

  const items = rows.map((r: any, idx: number) => ({
    rank: idx + 1,
    userId: String(r.user_id),
    value: Number(r.total_score)
  }));

  // Warm Redis cache
  if (items.length > 0) {
    const args: (string | number)[] = [];
    for (const it of items) args.push(it.value, it.userId);
    // ZADD key score member ...
    await redis.zadd("bb:lb:score", ...(args as any));
  }

  return items;
}

export async function getStreakLeaderboard(limit = 20): Promise<LeaderboardItem[]> {
  const cached = await zsetTop("bb:lb:streak", limit);
  if (cached.length > 0) return cached;

  const { rows } = await pgPool.query(
    `SELECT user_id, highest_streak
     FROM leaderboard_streak
     ORDER BY highest_streak DESC
     LIMIT $1`,
    [limit]
  );

  const items = rows.map((r: any, idx: number) => ({
    rank: idx + 1,
    userId: String(r.user_id),
    value: Number(r.highest_streak)
  }));

  if (items.length > 0) {
    const args: (string | number)[] = [];
    for (const it of items) args.push(it.value, it.userId);
    await redis.zadd("bb:lb:streak", ...(args as any));
  }

  return items;
}

