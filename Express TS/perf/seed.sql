-- ============================================================================
-- perf/seed.sql : fill the TEST database with lots of fake rows
-- ============================================================================
-- Why: your dev database has a handful of rows, so EVERY query looks fast.
-- Problems with missing indexes only show up with many rows. We make 100,000
-- users and 300,000 login sessions so you can SEE the difference.
--
-- RUN IT ONLY ON express_test. The first block below refuses to run anywhere
-- else. (The integration tests wipe this data on purpose, so seed again
-- whenever you want to experiment.)
--
--   psql -U postgres -d express_test -f perf/seed.sql
-- ============================================================================

-- Safety: stop immediately unless the database name contains "test".
DO $$
BEGIN
  IF current_database() NOT LIKE '%test%' THEN
    RAISE EXCEPTION 'Refusing to seed "%": its name must contain "test"', current_database();
  END IF;
END $$;

-- Start from an empty database.
TRUNCATE TABLE users RESTART IDENTITY CASCADE;

-- 100,000 fake users. generate_series(1, 100000) makes the numbers 1..100000.
INSERT INTO users (name, email, password_hash, role, email_verified_at)
SELECT
  'User ' || g,
  'user' || g || '@example.com',
  '$argon2id$v=19$m=65536,t=3,p=4$ZmFrZXNhbHQ$ZmFrZWhhc2g',  -- fake, not a real hash
  'user',
  NOW()
FROM generate_series(1, 100000) AS g;

-- 3 login sessions per user = 300,000 rows. Half of them are revoked.
-- token_hash: two md5 values glued together = 64 random-looking hex characters,
-- the same shape as the real SHA-256 hashes.
INSERT INTO refresh_sessions (user_id, token_hash, expires_at, revoked_at)
SELECT
  u.id,
  md5(random()::text || s::text) || md5(s::text || random()::text),
  NOW() + INTERVAL '7 days',
  CASE WHEN s % 2 = 0 THEN NOW() ELSE NULL END
FROM users u
CROSS JOIN generate_series(1, 3) AS s;

-- Refresh PostgreSQL's statistics, so its query planner knows the table sizes.
ANALYZE;

SELECT
  (SELECT COUNT(*) FROM users)            AS users,
  (SELECT COUNT(*) FROM refresh_sessions) AS sessions;
