"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureUserExists = ensureUserExists;
exports.createFreshSession = createFreshSession;
exports.getNextQuestion = getNextQuestion;
exports.submitAnswer = submitAnswer;

const { randomUUID } = require("crypto");
const { pgPool } = require("../../db/pool");
const { getEnv } = require("../../config/env");
const { sha256Hex, normalizeAnswer } = require("../../utils/hash");

const env = getEnv();

// In-memory store (temporary Redis replacement)
const memoryStore = new Map();

function stateKey(userId, sessionId) {
  return `bb:state:${userId}:${sessionId}`;
}

async function ensureUserExists(userId) {
  await pgPool.query(
    `INSERT INTO users (id)
     VALUES ($1)
     ON CONFLICT (id) DO NOTHING`,
    [userId]
  );
}

async function loadStateFromPostgres(userId, sessionId) {
  const { rows } = await pgPool.query(
    `SELECT * FROM user_state
     WHERE user_id = $1 AND session_id = $2
     LIMIT 1`,
    [userId, sessionId]
  );

  if (!rows.length) return null;

  const r = rows[0];
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
    currentQuestionId: r.current_question_id,
    questionIssuedAt: r.question_issued_at,
  };
}

async function loadState(userId, sessionId) {
  const key = stateKey(userId, sessionId);
  const cached = memoryStore.get(key);

  if (cached) return JSON.parse(cached);

  const db = await loadStateFromPostgres(userId, sessionId);
  if (!db) return null;

  memoryStore.set(key, JSON.stringify(db));
  return db;
}

async function persistState(state) {
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_SECONDS * 1000);

  await pgPool.query(
    `INSERT INTO user_state (
      user_id, session_id,
      current_difficulty, current_score, current_streak, highest_streak,
      total_answered, total_correct,
      wrong_streak, ema_performance, cooldown,
      current_question_id, question_issued_at,
      last_seen_at, expires_at
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),$14
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
      state.questionIssuedAt,
      expiresAt,
    ]
  );

  memoryStore.set(stateKey(state.userId, state.sessionId), JSON.stringify(state));
}

function newSessionId() {
  return randomUUID();
}

async function createFreshSession(userId) {
  const state = {
    userId,
    sessionId: newSessionId(),
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
  };

  await persistState(state);
  return state;
}

// get question by ID
async function getQuestionById(id) {
  const { rows } = await pgPool.query(
    `SELECT id, difficulty, prompt, choices
     FROM questions WHERE id=$1 LIMIT 1`,
    [id]
  );

  return rows[0];
}

async function pickQuestion(difficulty) {
  const { rows } = await pgPool.query(
    `SELECT id, difficulty, prompt, choices
     FROM questions
     WHERE difficulty=$1
     ORDER BY random()
     LIMIT 1`,
    [difficulty]
  );

  if (!rows.length) throw new Error("No questions in DB");

  return rows[0];
}

function toApiQuestion(row) {
  return {
    questionId: row.id,
    difficulty: row.difficulty,
    prompt: row.prompt,
    choices: row.choices,
  };
}

async function getNextQuestion(userId, sessionId) {
  await ensureUserExists(userId);

  let state = sessionId
    ? (await loadState(userId, sessionId)) || (await createFreshSession(userId))
    : await createFreshSession(userId);

  // IMPORTANT FIX
  if (state.currentQuestionId) {
    const existing = await getQuestionById(state.currentQuestionId);

    return {
      ...toApiQuestion(existing),
      sessionId: state.sessionId,
      currentScore: state.currentScore,
      currentStreak: state.currentStreak,
    };
  }

  const picked = await pickQuestion(state.currentDifficulty);

  state.currentQuestionId = picked.id;
  state.questionIssuedAt = new Date().toISOString();

  await persistState(state);

  return {
    ...toApiQuestion(picked),
    sessionId: state.sessionId,
    currentScore: state.currentScore,
    currentStreak: state.currentStreak,
  };
}

async function submitAnswer(input) {
  const state = await loadState(input.userId, input.sessionId);
  if (!state) throw new Error("Session expired");

  const { rows } = await pgPool.query(
    `SELECT correct_answer_hash FROM questions WHERE id=$1`,
    [input.questionId]
  );

  const correct =
    sha256Hex(normalizeAnswer(input.answer)) === rows[0].correct_answer_hash;

  state.currentQuestionId = null;
  state.currentScore += correct ? 10 : 0;

  await persistState(state);

  return {
    correct,
    totalScore: state.currentScore,
  };
}
