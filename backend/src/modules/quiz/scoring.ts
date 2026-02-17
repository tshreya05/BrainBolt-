/**
 * Scoring model (simple but logical)
 * ---------------------------------
 * Score depends on:
 * - difficulty of the question
 * - streak multiplier (capped)
 * - basic accuracy factor
 *
 * We keep scoreDelta non-negative (wrong answers give 0 points).
 */

export type ScoringInputs = {
  correct: boolean;
  difficulty: number;
  streakAfter: number; // streak value AFTER applying this answer
  totalAnsweredAfter: number;
  totalCorrectAfter: number;
};

const STREAK_CAP = 7; // capped multiplier effect

export function computeScoreDelta(input: ScoringInputs): number {
  if (!input.correct) return 0;

  const base = input.difficulty * 10;

  // Streak multiplier grows slowly and caps.
  // streak=1 => 1.00x, streak=7+ => 1.90x
  const cappedStreak = Math.min(input.streakAfter, STREAK_CAP);
  const streakMultiplier = 1 + (cappedStreak - 1) * 0.15;

  // Accuracy factor rewards consistency, but doesn't punish beginners too hard.
  // Range: [0.6, 1.0]
  const accuracy = input.totalAnsweredAfter > 0 ? input.totalCorrectAfter / input.totalAnsweredAfter : 0;
  const accuracyFactor = 0.6 + 0.4 * accuracy;

  return Math.max(0, Math.round(base * streakMultiplier * accuracyFactor));
}

