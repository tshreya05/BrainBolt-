/**
 * BrainBolt adaptive difficulty algorithm
 * -------------------------------------
 * Goals:
 * - Use streak + recent performance (EMA)
 * - Avoid oscillation ("ping-pong") between difficulties
 * - Include:
 *    - minimum streak before increasing difficulty
 *    - small buffer before reducing difficulty
 *
 * Key ideas:
 * - We maintain an EMA performance signal in [-1, 1] approximately:
 *     correct = +1, wrong = -1
 *     ema = ema * (1 - alpha) + alpha * signal
 * - We only increase difficulty when:
 *     - user is correct
 *     - streak >= MIN_STREAK_UP
 *     - ema is positive enough (not just a lucky guess)
 * - We only decrease difficulty when:
 *     - user is wrong
 *     - wrongStreak >= WRONG_BUFFER_DOWN (small buffer)
 *     - ema is negative enough
 * - After any difficulty change, we start a short cooldown so the next answer
 *   can't immediately flip difficulty back.
 *
 * Pseudocode:
 * -----------
 * onAnswer(correct):
 *   signal = correct ? +1 : -1
 *   ema = ema*(1-alpha) + alpha*signal
 *
 *   if correct:
 *      streak++
 *      wrongStreak = 0
 *   else:
 *      streak = 0
 *      wrongStreak++
 *
 *   if cooldown > 0:
 *      cooldown--
 *      return difficulty
 *
 *   if correct and streak >= MIN_STREAK_UP and ema >= EMA_UP_THRESHOLD:
 *      difficulty++
 *      cooldown = COOLDOWN_QUESTIONS
 *   else if !correct and wrongStreak >= WRONG_BUFFER_DOWN and ema <= EMA_DOWN_THRESHOLD:
 *      difficulty--
 *      cooldown = COOLDOWN_QUESTIONS
 *
 *   difficulty = clamp(difficulty, min, max)
 *   return difficulty
 */

export type AdaptiveState = {
  difficulty: number;
  streak: number;
  wrongStreak: number;
  emaPerformance: number;
  cooldown: number;
};

export type AdaptiveConfig = {
  minDifficulty: number;
  maxDifficulty: number;
};

const alpha = 0.2; // EMA update rate; smaller = smoother (less jumpy)
const MIN_STREAK_UP = 2; // minimum correct streak before we increase difficulty
const WRONG_BUFFER_DOWN = 2; // require 2 consecutive wrong answers before decreasing
const EMA_UP_THRESHOLD = 0.25;
const EMA_DOWN_THRESHOLD = -0.25;
const COOLDOWN_QUESTIONS = 2; // prevents immediate flip-flop

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function applyAdaptiveStep(
  prev: AdaptiveState,
  correct: boolean,
  config: AdaptiveConfig
): AdaptiveState {
  const signal = correct ? 1 : -1;
  const emaPerformance = prev.emaPerformance * (1 - alpha) + alpha * signal;

  let streak = prev.streak;
  let wrongStreak = prev.wrongStreak;
  if (correct) {
    streak += 1;
    wrongStreak = 0;
  } else {
    streak = 0;
    wrongStreak += 1;
  }

  let cooldown = prev.cooldown;
  let difficulty = prev.difficulty;

  if (cooldown > 0) {
    cooldown -= 1;
    return {
      difficulty: clamp(difficulty, config.minDifficulty, config.maxDifficulty),
      streak,
      wrongStreak,
      emaPerformance,
      cooldown
    };
  }

  const canIncrease = correct && streak >= MIN_STREAK_UP && emaPerformance >= EMA_UP_THRESHOLD;
  const canDecrease = !correct && wrongStreak >= WRONG_BUFFER_DOWN && emaPerformance <= EMA_DOWN_THRESHOLD;

  if (canIncrease) {
    difficulty += 1;
    cooldown = COOLDOWN_QUESTIONS;
  } else if (canDecrease) {
    difficulty -= 1;
    cooldown = COOLDOWN_QUESTIONS;
  }

  difficulty = clamp(difficulty, config.minDifficulty, config.maxDifficulty);

  return { difficulty, streak, wrongStreak, emaPerformance, cooldown };
}

