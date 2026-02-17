import type {
  LeaderboardResponse,
  QuizAnswerRequest,
  QuizAnswerResponse,
  QuizNextRequest,
  QuizNextResponse
} from "@/types";

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = data?.error ? String(data.error) : `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export async function fetchNext(req: QuizNextRequest): Promise<QuizNextResponse> {
  // The backend supports query OR JSON body for GET.
  const url = new URL("/v1/quiz/next", baseUrl);
  url.searchParams.set("userId", req.userId);
  if (req.sessionId) url.searchParams.set("sessionId", req.sessionId);

  const res = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  return readJson<QuizNextResponse>(res);
}

export async function submitAnswer(req: QuizAnswerRequest): Promise<QuizAnswerResponse> {
  const res = await fetch(`${baseUrl}/v1/quiz/answer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req)
  });
  return readJson<QuizAnswerResponse>(res);
}

export async function fetchScoreLeaderboard(): Promise<LeaderboardResponse> {
  const res = await fetch(`${baseUrl}/v1/leaderboard/score`, { cache: "no-store" });
  return readJson<LeaderboardResponse>(res);
}

export async function fetchStreakLeaderboard(): Promise<LeaderboardResponse> {
  const res = await fetch(`${baseUrl}/v1/leaderboard/streak`, { cache: "no-store" });
  return readJson<LeaderboardResponse>(res);
}

