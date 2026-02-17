import crypto from "crypto";
import { pgPool } from "../../db/pool";
import { redis } from "../../redis/client";
import { getEnv } from "../../config/env";
import { normalizeAnswer, sha256Hex } from "../../utils/hash";
import { applyAdaptiveStep } from "./adaptive";
import { computeScoreDelta } from "./scoring";

type QuestionRow = {
  id: string;
  difficulty: number;
  prompt: string;
  choices: unknown; // jsonb
  correct_answer_hash: string;
};

export type QuizQuestion = {
  questionId: string;
  difficulty: number;
  prompt: string;
  choices: string[];
};

export type UserState = {
  userId: string;
  sessionId: string;
  currentDifficulty: number;
  currentScore: number;
  currentStreak: number;
  highestStreak: number;
  totalAnswered: number;
  totalCorrect: number;
  wrongStreak: number;
  emaPerformance: number;
  cooldown: number;
  currentQuestionId: string | null;
  questionIssuedAt: string | null; // ISO
  expiresAt: string; // ISO
};

export type NextResponse = QuizQuestion & {
  sessionId: string;
  currentScore: number;
  currentStreak: number;
};

export type AnswerResponse = {
  correct: boolean;
  newDifficulty: number;
  newStreak: number;
  scoreDelta: number;
  totalScore: number;
};

const env = getEnv();

function stateKey(userId: string, sessionId: string) {
  return `bb:state:${userId}:${sessionId}`;
}

export async function ensureUserExists(userId: string): Promise<void> {
  await pgPool.query(
    `INSERT INTO users (id)
     VALUES ($1)
     ON CONFLICT (id) DO NOTHING`,
    [userId]
  );
}

async function loadStateFromPostgres(userId: string, sessionId: string): Promise<UserState | null> {
  const { rows } = await pgPool.query(
    `SELECT
       user_id,
       session_id,
       current_difficulty,
       current_score,
       current_streak,
       highest_streak,
       total_answered,
       total_correct,
       wrong_streak,
       ema_performance,
       cooldown,
       current_question_id,
       question_issued_at,
       expires_at
     FROM user_state
     WHERE user_id = $1 AND session_id = $2
     LIMIT 1`,
    [userId, sessionId]
  );

  if (rows.length === 0) return null;

  const r = rows[0] as any;
  // Treat expired sessions as missing.
  if (new Date(r.expires_at).getTime() <= Date.now()) return null;

  return {
    userId: r.user_id,
    sessionId: r.session_id,
    currentDifficulty: Number(r.current_difficulty),
    currentScore: Number(r.current_score),
    currentStreak: Number(r.current_streak),
    highestStreak: Number(r.highest_streak),
    totalAnswered: Number(r.total_answered),
    totalCorrect: Number(r.total_correct),
    wrongStreak: Number(r.wrong_streak),
    emaPerformance: Number(r.ema_performance),
    cooldown: Number(r.cooldown),
    currentQuestionId: r.current_question_id ?? null,
    questionIssuedAt: r.question_issued_at ? new Date(r.question_issued_at).toISOString() : null,
    expiresAt: new Date(r.expires_at).toISOString()
  };
}

async function loadState(userId: string, sessionId: string): Promise<UserState | null> {
  const key = stateKey(userId, sessionId);
  const cached = await redis.get(key);
  if (cached) {
    try {
      return JSON.parse(cached) as UserState;
    } catch {
      // fall through to DB
    }
  }

  const fromDb = await loadStateFromPostgres(userId, sessionId);
  if (!fromDb) return null;

  await redis.set(key, JSON.stringify(fromDb), "EX", env.SESSION_TTL_SECONDS);
  return fromDb;
}

async function persistState(state: UserState): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.SESSION_TTL_SECONDS * 1000);

  state.expiresAt = expiresAt.toISOString();

  await pgPool.query(
    `INSERT INTO user_state (
        user_id, session_id,
        current_difficulty, current_score, current_streak, highest_streak,
        total_answered, total_correct,
        wrong_streak, ema_performance, cooldown,
        current_question_id, question_issued_at,
        last_seen_at, expires_at
     ) VALUES (
        $1, $2,
        $3, $4, $5, $6,
        $7, $8,
        $9, $10, $11,
        $12, $13,
        now(), $14
     )
     ON CONFLICT (user_id, session_id) DO UPDATE SET
       current_difficulty = EXCLUDED.current_difficulty,
       current_score = EXCLUDED.current_score,
       current_streak = EXCLUDED.current_streak,
       highest_streak = EXCLUDED.highest_streak,
       total_answered = EXCLUDED.total_answered,
       total_correct = EXCLUDED.total_correct,
       wrong_streak = EXCLUDED.wrong_streak,
       ema_performance = EXCLUDED.ema_performance,
       cooldown = EXCLUDED.cooldown,
       current_question_id = EXCLUDED.current_question_id,
       question_issued_at = EXCLUDED.question_issued_at,
       last_seen_at = now(),
       expires_at = EXCLUDED.expires_at`,
    [
      state.userId,
      state.sessionId,
      state.currentDifficulty,
      state.currentScore,
      state.currentStreak,
      state.highestStreak,
      state.totalAnswered,
      state.totalCorrect,
      state.wrongStreak,
      state.emaPerformance,
      state.cooldown,
      state.currentQuestionId,
      state.questionIssuedAt ? new Date(state.questionIssuedAt) : null,
      expiresAt
    ]
  );

  await redis.set(stateKey(state.userId, state.sessionId), JSON.stringify(state), "EX", env.SESSION_TTL_SECONDS);
}

function newSessionId(): string {
  return crypto.randomUUID();
}

async function persistStateDbInTransaction(client: { query: Function }, state: UserState, expiresAt: Date) {
  await client.query(
    `INSERT INTO user_state (
        user_id, session_id,
        current_difficulty, current_score, current_streak, highest_streak,
        total_answered, total_correct,
        wrong_streak, ema_performance, cooldown,
        current_question_id, question_issued_at,
        last_seen_at, expires_at
     ) VALUES (
        $1, $2,
        $3, $4, $5, $6,
        $7, $8,
        $9, $10, $11,
        $12, $13,
        now(), $14
     )
     ON CONFLICT (user_id, session_id) DO UPDATE SET
       current_difficulty = EXCLUDED.current_difficulty,
       current_score = EXCLUDED.current_score,
       current_streak = EXCLUDED.current_streak,
       highest_streak = EXCLUDED.highest_streak,
       total_answered = EXCLUDED.total_answered,
       total_correct = EXCLUDED.total_correct,
       wrong_streak = EXCLUDED.wrong_streak,
       ema_performance = EXCLUDED.ema_performance,
       cooldown = EXCLUDED.cooldown,
       current_question_id = EXCLUDED.current_question_id,
       question_issued_at = EXCLUDED.question_issued_at,
       last_seen_at = now(),
       expires_at = EXCLUDED.expires_at`,
    [
      state.userId,
      state.sessionId,
      state.currentDifficulty,
      state.currentScore,
      state.currentStreak,
      state.highestStreak,
      state.totalAnswered,
      state.totalCorrect,
      state.wrongStreak,
      state.emaPerformance,
      state.cooldown,
      state.currentQuestionId,
      state.questionIssuedAt ? new Date(state.questionIssuedAt) : null,
      expiresAt
    ]
  );
}

export async function createFreshSession(userId: string): Promise<UserState> {
  const sessionId = newSessionId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.SESSION_TTL_SECONDS * 1000);

  const state: UserState = {
    userId,
    sessionId,
    currentDifficulty: 3,
    currentScore: 0,
    currentStreak: 0,
    highestStreak: 0,
    totalAnswered: 0,
    totalCorrect: 0,
    wrongStreak: 0,
    emaPerformance: 0,
    cooldown: 0,
    currentQuestionId: null,
    questionIssuedAt: null,
    expiresAt: expiresAt.toISOString()
  };

  await persistState(state);
  return state;
}

async function getQuestionById(questionId: string): Promise<QuestionRow | null> {
  const { rows } = await pgPool.query(
    `SELECT id, difficulty, prompt, choices, correct_answer_hash
     FROM questions
     WHERE id = $1
     LIMIT 1`,
    [questionId]
  );
  return (rows[0] as QuestionRow) ?? null;
}

async function pickQuestion(userId: string, sessionId: string, difficulty: number): Promise<QuestionRow | null> {
  // Exclude the last 20 answered questions to reduce repeats.
  const { rows } = await pgPool.query(
    `SELECT q.id, q.difficulty, q.prompt, q.choices, q.correct_answer_hash
     FROM questions q
     WHERE q.difficulty = $1
       AND q.id NOT IN (
         SELECT question_id
         FROM answer_log
         WHERE user_id = $2 AND session_id = $3
         ORDER BY answered_at DESC
         LIMIT 20
       )
     ORDER BY random()
     LIMIT 1`,
    [difficulty, userId, sessionId]
  );
  return (rows[0] as QuestionRow) ?? null;
}

async function pickQuestionWithFallback(userId: string, sessionId: string, difficulty: number): Promise<QuestionRow> {
  const min = env.DIFFICULTY_MIN;
  const max = env.DIFFICULTY_MAX;

  const candidates: number[] = [];
  for (let offset = 0; offset <= (max - min); offset++) {
    const down = difficulty - offset;
    const up = difficulty + offset;
    if (down >= min) candidates.push(down);
    if (up <= max && up !== down) candidates.push(up);
    if (candidates.length >= (max - min + 1)) break;
  }

  for (const d of candidates) {
    const q = await pickQuestion(userId, sessionId, d);
    if (q) return q;
  }

  // Worst-case fallback: allow repeats.
  const { rows } = await pgPool.query(
    `SELECT id, difficulty, prompt, choices, correct_answer_hash
     FROM questions
     WHERE difficulty = $1
     ORDER BY random()
     LIMIT 1`,
    [difficulty]
  );
  if (rows.length === 0) throw new Error("No questions available in database");
  return rows[0] as QuestionRow;
}

function toApiQuestion(row: QuestionRow): QuizQuestion {
  const choices = Array.isArray(row.choices) ? (row.choices as string[]) : (row.choices as any[]);
  return {
    questionId: row.id,
    difficulty: Number(row.difficulty),
    prompt: row.prompt,
    choices: choices.map((c) => String(c))
  };
}

export async function getNextQuestion(userId: string, sessionId?: string): Promise<NextResponse> {
  await ensureUserExists(userId);

  let state: UserState;
  if (sessionId) {
    const existing = await loadState(userId, sessionId);
    state = existing ?? (await createFreshSession(userId));
  } else {
    state = await createFreshSession(userId);
  }

  // Serve exactly one question at a time:
  // if a question is already issued and not answered, return it again.
  if (state.currentQuestionId) {
    const row = await getQuestionById(state.currentQuestionId);
    if (!row) {
      // If question was deleted (shouldn't happen with seeded questions), clear state.
      state.currentQuestionId = null;
      state.questionIssuedAt = null;
    } else {
      const q = toApiQuestion(row);
      await persistState(state); // touch session TTL
      return {
        ...q,
        sessionId: state.sessionId,
        currentScore: state.currentScore,
        currentStreak: state.currentStreak
      };
    }
  }

  const picked = await pickQuestionWithFallback(userId, state.sessionId, state.currentDifficulty);
  const q = toApiQuestion(picked);

  // If we had to fall back to a nearby difficulty (edge case: not enough questions),
  // align the session's "served difficulty" with the actual question difficulty.
  state.currentDifficulty = q.difficulty;

  state.currentQuestionId = q.questionId;
  state.questionIssuedAt = new Date().toISOString();
  await persistState(state);

  return {
    ...q,
    sessionId: state.sessionId,
    currentScore: state.currentScore,
    currentStreak: state.currentStreak
  };
}

async function getExistingAnswer(userId: string, sessionId: string, questionId: string): Promise<AnswerResponse | null> {
  const { rows } = await pgPool.query(
    `SELECT correct, difficulty, score_delta, streak_after
     FROM answer_log
     WHERE user_id = $1 AND session_id = $2 AND question_id = $3
     LIMIT 1`,
    [userId, sessionId, questionId]
  );
  if (rows.length === 0) return null;

  const r = rows[0] as any;
  const state = await loadState(userId, sessionId);
  const totalScore = state?.currentScore ?? 0;

  return {
    correct: Boolean(r.correct),
    newDifficulty: state?.currentDifficulty ?? Number(r.difficulty),
    newStreak: state?.currentStreak ?? Number(r.streak_after),
    scoreDelta: Number(r.score_delta),
    totalScore
  };
}

export async function submitAnswer(input: {
  userId: string;
  sessionId: string;
  questionId: string;
  answer: string;
}): Promise<AnswerResponse> {
  await ensureUserExists(input.userId);

  const existing = await getExistingAnswer(input.userId, input.sessionId, input.questionId);
  if (existing) return existing; // duplicate answer => idempotent response

  const state = await loadState(input.userId, input.sessionId);
  if (!state) {
    // Session expired or unknown.
    throw Object.assign(new Error("Session expired"), { statusCode: 410 });
  }

  if (!state.currentQuestionId || state.currentQuestionId !== input.questionId) {
    throw Object.assign(new Error("This question is not the active question for the session"), {
      statusCode: 409
    });
  }

  const question = await getQuestionById(input.questionId);
  if (!question) {
    throw Object.assign(new Error("Question not found"), { statusCode: 404 });
  }

  const answerHash = sha256Hex(normalizeAnswer(input.answer));
  const correct = answerHash === question.correct_answer_hash;

  const servedDifficulty = Number(question.difficulty);

  // Apply adaptive step (uses streak + recent performance + buffer + cooldown)
  const nextAdaptive = applyAdaptiveStep(
    {
      difficulty: state.currentDifficulty,
      streak: state.currentStreak,
      wrongStreak: state.wrongStreak,
      emaPerformance: state.emaPerformance,
      cooldown: state.cooldown
    },
    correct,
    { minDifficulty: env.DIFFICULTY_MIN, maxDifficulty: env.DIFFICULTY_MAX }
  );

  const totalAnsweredAfter = state.totalAnswered + 1;
  const totalCorrectAfter = state.totalCorrect + (correct ? 1 : 0);

  const scoreDelta = computeScoreDelta({
    correct,
    difficulty: Number(question.difficulty),
    streakAfter: nextAdaptive.streak,
    totalAnsweredAfter,
    totalCorrectAfter
  });

  const totalScore = state.currentScore + scoreDelta;
  const highestStreak = Math.max(state.highestStreak, nextAdaptive.streak);

  // Clear active question so /next can issue a fresh one.
  state.currentQuestionId = null;
  state.questionIssuedAt = null;

  state.currentDifficulty = nextAdaptive.difficulty;
  state.currentStreak = nextAdaptive.streak;
  state.wrongStreak = nextAdaptive.wrongStreak;
  state.emaPerformance = nextAdaptive.emaPerformance;
  state.cooldown = nextAdaptive.cooldown;

  state.totalAnswered = totalAnsweredAfter;
  state.totalCorrect = totalCorrectAfter;
  state.currentScore = totalScore;
  state.highestStreak = highestStreak;

  // Persist answer + state + leaderboards in a DB transaction.
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.SESSION_TTL_SECONDS * 1000);
  state.expiresAt = expiresAt.toISOString();

  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO answer_log (user_id, session_id, question_id, answer, correct, difficulty, score_delta, streak_after)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        input.userId,
        input.sessionId,
        input.questionId,
        input.answer,
        correct,
        servedDifficulty,
        scoreDelta,
        nextAdaptive.streak
      ]
    );

    await persistStateDbInTransaction(client, state, expiresAt);

    await client.query(
      `INSERT INTO leaderboard_score (user_id, total_score, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET
         total_score = EXCLUDED.total_score,
         updated_at = now()`,
      [input.userId, totalScore]
    );

    await client.query(
      `INSERT INTO leaderboard_streak (user_id, highest_streak, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE SET
         highest_streak = GREATEST(leaderboard_streak.highest_streak, EXCLUDED.highest_streak),
         updated_at = now()`,
      [input.userId, highestStreak]
    );

    await client.query("COMMIT");
  } catch (e: any) {
    await client.query("ROLLBACK");
    // If we raced with a duplicate answer insert, return idempotent response.
    // Postgres unique violation: 23505
    if (String(e?.code) === "23505") {
      const dup = await getExistingAnswer(input.userId, input.sessionId, input.questionId);
      if (dup) return dup;
    }
    throw e;
  } finally {
    client.release();
  }

  // Cache state in Redis after transaction succeeds.
  await redis.set(stateKey(state.userId, state.sessionId), JSON.stringify(state), "EX", env.SESSION_TTL_SECONDS);

  // Update Redis leaderboards (cache only).
  // Note: we intentionally keep Redis as a cache; DB is the source of truth.
  await redis.zadd("bb:lb:score", totalScore, input.userId);
  await redis.zadd("bb:lb:streak", highestStreak, input.userId);

  return {
    correct,
    newDifficulty: state.currentDifficulty,
    newStreak: state.currentStreak,
    scoreDelta,
    totalScore
  };
}

