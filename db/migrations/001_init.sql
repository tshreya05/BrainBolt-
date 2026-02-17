-- BrainBolt initial schema + seed data
-- This file is mounted into /docker-entrypoint-initdb.d and runs automatically
-- on first container startup (fresh postgres volume).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------
-- users
-- -----------------------------
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------
-- questions (seeded static)
-- correct_answer_hash stores SHA-256 of normalized correct answer text.
-- normalization: lower(trim(answer))
-- -----------------------------
CREATE TABLE IF NOT EXISTS questions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  difficulty          SMALLINT NOT NULL CHECK (difficulty >= 1 AND difficulty <= 10),
  prompt              TEXT NOT NULL,
  choices             JSONB NOT NULL,
  correct_answer_hash TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions (difficulty);

-- -----------------------------
-- user_state (persisted state; Redis caches this)
-- one question at a time is enforced by current_question_id + question_issued_at
-- -----------------------------
CREATE TABLE IF NOT EXISTS user_state (
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id          TEXT NOT NULL,
  current_difficulty  SMALLINT NOT NULL CHECK (current_difficulty >= 1 AND current_difficulty <= 10),
  current_score       INT NOT NULL DEFAULT 0 CHECK (current_score >= 0),
  current_streak      INT NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  highest_streak      INT NOT NULL DEFAULT 0 CHECK (highest_streak >= 0),
  total_answered      INT NOT NULL DEFAULT 0 CHECK (total_answered >= 0),
  total_correct       INT NOT NULL DEFAULT 0 CHECK (total_correct >= 0),
  wrong_streak        INT NOT NULL DEFAULT 0 CHECK (wrong_streak >= 0),
  ema_performance     REAL NOT NULL DEFAULT 0, -- range roughly [-1, 1]
  cooldown            SMALLINT NOT NULL DEFAULT 0 CHECK (cooldown >= 0),
  current_question_id UUID NULL REFERENCES questions(id),
  question_issued_at  TIMESTAMPTZ NULL,
  last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  PRIMARY KEY (user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_user_state_user ON user_state (user_id);
CREATE INDEX IF NOT EXISTS idx_user_state_expires ON user_state (expires_at);

-- -----------------------------
-- answer_log (idempotency + auditing)
-- unique per (user_id, session_id, question_id) prevents duplicate scoring
-- -----------------------------
CREATE TABLE IF NOT EXISTS answer_log (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id  TEXT NOT NULL,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer      TEXT NOT NULL,
  correct     BOOLEAN NOT NULL,
  difficulty  SMALLINT NOT NULL CHECK (difficulty >= 1 AND difficulty <= 10),
  score_delta INT NOT NULL DEFAULT 0 CHECK (score_delta >= 0),
  streak_after INT NOT NULL DEFAULT 0 CHECK (streak_after >= 0),
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_answer_log_user_time ON answer_log (user_id, answered_at DESC);
CREATE INDEX IF NOT EXISTS idx_answer_log_session ON answer_log (session_id);

-- -----------------------------
-- leaderboards (persisted; Redis stores sorted sets)
-- -----------------------------
CREATE TABLE IF NOT EXISTS leaderboard_score (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_score INT NOT NULL DEFAULT 0 CHECK (total_score >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leaderboard_streak (
  user_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  highest_streak INT NOT NULL DEFAULT 0 CHECK (highest_streak >= 0),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_score_rank ON leaderboard_score (total_score DESC);
CREATE INDEX IF NOT EXISTS idx_leaderboard_streak_rank ON leaderboard_streak (highest_streak DESC);

-- -----------------------------
-- Seed questions
-- We only insert if table is empty to keep init idempotent.
-- -----------------------------
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM questions) = 0 THEN
    INSERT INTO questions (id, difficulty, prompt, choices, correct_answer_hash) VALUES
    -- Difficulty 1
    ('11111111-1111-1111-1111-111111111111', 1, 'What is 2 + 2?', '["3","4","5","6"]'::jsonb, encode(digest(lower(btrim('4')), 'sha256'), 'hex')),
    ('11111111-1111-1111-1111-111111111112', 1, 'Which color is the sky on a clear day?', '["Green","Blue","Red","Yellow"]'::jsonb, encode(digest(lower(btrim('Blue')), 'sha256'), 'hex')),
    ('11111111-1111-1111-1111-111111111113', 1, 'Which animal barks?', '["Cat","Dog","Cow","Sheep"]'::jsonb, encode(digest(lower(btrim('Dog')), 'sha256'), 'hex')),

    -- Difficulty 2
    ('22222222-2222-2222-2222-222222222221', 2, 'What is 10 / 2?', '["2","5","8","10"]'::jsonb, encode(digest(lower(btrim('5')), 'sha256'), 'hex')),
    ('22222222-2222-2222-2222-222222222222', 2, 'Which planet is known as the Red Planet?', '["Earth","Mars","Jupiter","Venus"]'::jsonb, encode(digest(lower(btrim('Mars')), 'sha256'), 'hex')),
    ('22222222-2222-2222-2222-222222222223', 2, 'Which is a primary emotion?', '["Happiness","Jealousy","Confusion","Boredom"]'::jsonb, encode(digest(lower(btrim('Happiness')), 'sha256'), 'hex')),

    -- Difficulty 3
    ('33333333-3333-3333-3333-333333333331', 3, 'What is the capital of France?', '["Rome","Madrid","Paris","Berlin"]'::jsonb, encode(digest(lower(btrim('Paris')), 'sha256'), 'hex')),
    ('33333333-3333-3333-3333-333333333332', 3, 'Which data type stores true/false in most programming languages?', '["Integer","Boolean","String","Float"]'::jsonb, encode(digest(lower(btrim('Boolean')), 'sha256'), 'hex')),
    ('33333333-3333-3333-3333-333333333333', 3, 'Which is the largest ocean on Earth?', '["Atlantic","Indian","Pacific","Arctic"]'::jsonb, encode(digest(lower(btrim('Pacific')), 'sha256'), 'hex')),

    -- Difficulty 4
    ('44444444-4444-4444-4444-444444444441', 4, 'What does HTTP stand for?', '["HyperText Transfer Protocol","High Transfer Text Program","Home Tool Transfer Protocol","Hyperlink Transfer Procedure"]'::jsonb, encode(digest(lower(btrim('HyperText Transfer Protocol')), 'sha256'), 'hex')),
    ('44444444-4444-4444-4444-444444444442', 4, 'Which SQL command is used to remove rows from a table?', '["DELETE","DROP","REMOVE","ERASE"]'::jsonb, encode(digest(lower(btrim('DELETE')), 'sha256'), 'hex')),
    ('44444444-4444-4444-4444-444444444443', 4, 'What is the square root of 81?', '["7","8","9","10"]'::jsonb, encode(digest(lower(btrim('9')), 'sha256'), 'hex')),

    -- Difficulty 5
    ('55555555-5555-5555-5555-555555555551', 5, 'Which company created the TypeScript language?', '["Google","Microsoft","Meta","Apple"]'::jsonb, encode(digest(lower(btrim('Microsoft')), 'sha256'), 'hex')),
    ('55555555-5555-5555-5555-555555555552', 5, 'In Git, which command creates a new branch and switches to it?', '["git branch","git checkout -b","git switch --list","git merge"]'::jsonb, encode(digest(lower(btrim('git checkout -b')), 'sha256'), 'hex')),
    ('55555555-5555-5555-5555-555555555553', 5, 'What is the output of 3 * (4 + 2)?', '["12","14","18","24"]'::jsonb, encode(digest(lower(btrim('18')), 'sha256'), 'hex')),

    -- Difficulty 6
    ('66666666-6666-6666-6666-666666666661', 6, 'Which HTTP status code means "Unauthorized"?', '["200","301","401","500"]'::jsonb, encode(digest(lower(btrim('401')), 'sha256'), 'hex')),
    ('66666666-6666-6666-6666-666666666662', 6, 'Which normal form reduces partial dependency in relational databases?', '["1NF","2NF","3NF","BCNF"]'::jsonb, encode(digest(lower(btrim('2NF')), 'sha256'), 'hex')),
    ('66666666-6666-6666-6666-666666666663', 6, 'In JavaScript, what does Array.prototype.map return?', '["A new array","The original array","A number","A boolean"]'::jsonb, encode(digest(lower(btrim('A new array')), 'sha256'), 'hex')),

    -- Difficulty 7
    ('77777777-7777-7777-7777-777777777771', 7, 'What is the time complexity of binary search on a sorted array?', '["O(n)","O(log n)","O(n log n)","O(1)"]'::jsonb, encode(digest(lower(btrim('O(log n)')), 'sha256'), 'hex')),
    ('77777777-7777-7777-7777-777777777772', 7, 'Which isolation level prevents dirty reads but allows non-repeatable reads?', '["Read Uncommitted","Read Committed","Repeatable Read","Serializable"]'::jsonb, encode(digest(lower(btrim('Read Committed')), 'sha256'), 'hex')),
    ('77777777-7777-7777-7777-777777777773', 7, 'Which data structure is typically used to implement BFS?', '["Stack","Queue","Heap","Tree"]'::jsonb, encode(digest(lower(btrim('Queue')), 'sha256'), 'hex')),

    -- Difficulty 8
    ('88888888-8888-8888-8888-888888888881', 8, 'In PostgreSQL, which index type is generally best for range queries on a single column?', '["GIN","GiST","B-tree","Hash"]'::jsonb, encode(digest(lower(btrim('B-tree')), 'sha256'), 'hex')),
    ('88888888-8888-8888-8888-888888888882', 8, 'Which CAP theorem property is sacrificed in an AP system during a network partition?', '["Availability","Consistency","Partition tolerance","Durability"]'::jsonb, encode(digest(lower(btrim('Consistency')), 'sha256'), 'hex')),
    ('88888888-8888-8888-8888-888888888883', 8, 'What does "idempotent" mean for an API request?', '["Always succeeds","Can be repeated with same effect","Returns JSON only","Requires authentication"]'::jsonb, encode(digest(lower(btrim('Can be repeated with same effect')), 'sha256'), 'hex')),

    -- Difficulty 9
    ('99999999-9999-9999-9999-999999999991', 9, 'Which join returns all rows from the left table and matching rows from the right table?', '["INNER JOIN","LEFT JOIN","RIGHT JOIN","CROSS JOIN"]'::jsonb, encode(digest(lower(btrim('LEFT JOIN')), 'sha256'), 'hex')),
    ('99999999-9999-9999-9999-999999999992', 9, 'Which algorithm is commonly used to find the shortest path in a graph with non-negative weights?', '["DFS","Dijkstra","Kruskal","Prim"]'::jsonb, encode(digest(lower(btrim('Dijkstra')), 'sha256'), 'hex')),
    ('99999999-9999-9999-9999-999999999993', 9, 'What is the primary purpose of database transactions?', '["Speed up queries","Ensure ACID guarantees","Compress storage","Create indexes"]'::jsonb, encode(digest(lower(btrim('Ensure ACID guarantees')), 'sha256'), 'hex')),

    -- Difficulty 10
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 10, 'In distributed systems, what does "split-brain" describe?', '["A disk failure","A cluster partition causing multiple leaders","A memory leak","A CPU spike"]'::jsonb, encode(digest(lower(btrim('A cluster partition causing multiple leaders')), 'sha256'), 'hex')),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 10, 'Which technique helps prevent thundering herd on cache misses?', '["Inlining","Cache stampede protection (locking)","Minification","Dead code elimination"]'::jsonb, encode(digest(lower(btrim('Cache stampede protection (locking)')), 'sha256'), 'hex')),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 10, 'Which concept describes ensuring messages are processed once or more with deduplication?', '["Exactly-once semantics","Backpressure","Circuit breaking","Sharding"]'::jsonb, encode(digest(lower(btrim('Exactly-once semantics')), 'sha256'), 'hex'));
  END IF;
END $$;

