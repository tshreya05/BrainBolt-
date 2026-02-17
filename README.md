# BrainBolt – Adaptive Infinite Quiz Platform

BrainBolt is an adaptive quiz system that serves **exactly one question at a time per user/session**. Difficulty increases after correct answers and decreases after wrong answers, while staying within defined bounds.

## Tech stack

- **Frontend**: Next.js + React + TypeScript + Tailwind (light/dark mode)
- **Backend**: Node.js + Express + TypeScript (modular routes, input validation)
- **Database**: PostgreSQL (SQL schema + migrations, seeded questions)
- **Cache**: Redis (only for user state + leaderboards)
- **Docker**: `docker compose up --build`

## Quick start (Docker)

1. Install Docker Desktop.
2. From the repo root, run:

```bash
docker compose up --build
```

3. Open:
- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:4000/health`

## Project structure

```
.
├─ backend/        # Express API (v1)
├─ frontend/       # Next.js UI
├─ db/
│  └─ migrations/  # SQL migrations + seed
└─ docker-compose.yml
```

## API (assignment format)

### GET /v1/quiz/next

Request:
```json
{
  "userId": "string",
  "sessionId": "optional string"
}
```

Response:
```json
{
  "questionId": "string",
  "difficulty": 3,
  "prompt": "string",
  "choices": ["choice 1", "choice 2", "choice 3", "choice 4"],
  "sessionId": "string",
  "currentScore": 120,
  "currentStreak": 4
}
```

### POST /v1/quiz/answer

Request:
```json
{
  "userId": "string",
  "sessionId": "string",
  "questionId": "string",
  "answer": "string"
}
```

Response:
```json
{
  "correct": true,
  "newDifficulty": 4,
  "newStreak": 5,
  "scoreDelta": 38,
  "totalScore": 158
}
```

### GET /v1/leaderboard/score
### GET /v1/leaderboard/streak

## Adaptive algorithm (high level)

- Uses **streak**, **consecutive wrong buffer**, and a small **EMA performance signal**
- Includes a **cooldown** after changing difficulty to avoid “ping-pong” oscillation
- Difficulty always stays within bounds

### Pseudocode

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
```

Implementation: `backend/src/modules/quiz/adaptive.ts`

## System design overview (simple + realistic)

- **One question at a time**
  - Persisted in PostgreSQL `user_state.current_question_id`
  - Cached in Redis under `bb:state:<userId>:<sessionId>`
  - `/v1/quiz/next` re-returns the same active question until it’s answered

- **Duplicate answers (idempotency)**
  - PostgreSQL `answer_log` has `UNIQUE (user_id, session_id, question_id)`
  - `/v1/quiz/answer` returns the already-computed result if a duplicate arrives

- **Leaderboards**
  - Stored in PostgreSQL (`leaderboard_score`, `leaderboard_streak`)
  - Cached in Redis sorted sets (`bb:lb:score`, `bb:lb:streak`)
  - Updated after every answer

- **Security for answers**
  - Correct answers are stored hashed (`SHA-256(lower(trim(answer)))`) in `questions.correct_answer_hash`


