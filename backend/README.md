# BrainBolt Backend

## Overview

This backend provides the required v1 APIs:

- `GET /v1/quiz/next`
- `POST /v1/quiz/answer`
- `GET /v1/leaderboard/score`
- `GET /v1/leaderboard/streak`

It uses:
- PostgreSQL for users, questions, answer logs, and persisted state
- Redis **only** for:
  - cached user state (`bb:state:<userId>:<sessionId>`)
  - cached leaderboards (`bb:lb:score`, `bb:lb:streak`)

## Adaptive algorithm

BrainBolt uses a **stable** adaptive step that combines:
- **Streak rules** (minimum streak before leveling up)
- **Wrong buffer** (require consecutive wrong answers to level down)
- **EMA performance** (recent correctness trend)
- **Cooldown** (prevents immediate flip-flopping)

### Why this avoids oscillation

- Difficulty won’t increase on a single lucky correct answer: it requires a small streak and a positive EMA.
- Difficulty won’t decrease immediately after a single mistake: it requires a wrong buffer and a negative EMA.
- After any difficulty change, a short cooldown prevents immediate reversal.

### Pseudocode (same as in code)

```text
onAnswer(correct):
  signal = correct ? +1 : -1
  ema = ema*(1-alpha) + alpha*signal

  if correct:
     streak++
     wrongStreak = 0
  else:
     streak = 0
     wrongStreak++

  if cooldown > 0:
     cooldown--
     return difficulty

  if correct and streak >= MIN_STREAK_UP and ema >= EMA_UP_THRESHOLD:
     difficulty++
     cooldown = COOLDOWN_QUESTIONS
  else if !correct and wrongStreak >= WRONG_BUFFER_DOWN and ema <= EMA_DOWN_THRESHOLD:
     difficulty--
     cooldown = COOLDOWN_QUESTIONS

  difficulty = clamp(difficulty, min, max)
  return difficulty
```

Implementation: `src/modules/quiz/adaptive.ts`

## Scoring system

Score delta is computed on correct answers only:
- base points: `difficulty * 10`
- streak multiplier: capped growth (prevents runaway scores)
- accuracy factor: ranges from 0.6 to 1.0 (rewards consistency without being harsh)

Implementation: `src/modules/quiz/scoring.ts`

## Edge cases handled

- **Duplicate answers**: prevented by DB constraint `UNIQUE (user_id, session_id, question_id)` and served idempotently.
- **One question at a time**: `user_state.current_question_id` ensures `/next` re-returns the same question until answered.
- **Difficulty boundaries**: difficulty is clamped to `[DIFFICULTY_MIN, DIFFICULTY_MAX]`.
- **Session expiry / inactivity**: state is cached with Redis TTL and also stored with `expires_at` in PostgreSQL.

