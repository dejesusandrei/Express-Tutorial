-- ============================================================================
-- perf/explain.sql : ask PostgreSQL HOW it runs a query
-- ============================================================================
-- EXPLAIN ANALYZE actually runs the query and reports the plan and the time.
-- Run these sections ONE AT A TIME in pgAdmin's Query Tool (select the
-- statements of one section and press F5), on express_test AFTER seed.sql.
--
-- The words to look for in the output:
--   Seq Scan    = walked along EVERY shelf (reads all rows). Slow on big tables.
--   Index Scan  = used the card catalog and jumped to the row. Fast.
--   Execution Time = how long it really took, in milliseconds.
--   Rows Removed by Filter: 99999  = it read 100,000 rows to keep ONE. Bad sign.
--
-- Plan: run sections 1-4 BEFORE 006_indexes.sql, write down the times, run the
-- migration, then run sections 1-4 again and compare.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. Which indexes exist right now? (Run this BEFORE 006_indexes.sql, and skip
--    the lines of 006 for columns that already appear here.)
-- ---------------------------------------------------------------------------
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;


-- ---------------------------------------------------------------------------
-- 1. Login: find a user by email
-- ---------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, email
FROM users
WHERE lower(email) = 'user77777@example.com';


-- ---------------------------------------------------------------------------
-- 2. /refresh and /logout: find a session by token hash
--    First get a real hash, copy it, and paste it below.
-- ---------------------------------------------------------------------------
SELECT token_hash FROM refresh_sessions OFFSET 150000 LIMIT 1;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, user_id
FROM refresh_sessions
WHERE token_hash = 'PASTE_TOKEN_HASH_HERE'
  AND revoked_at IS NULL
  AND expires_at > NOW();


-- ---------------------------------------------------------------------------
-- 3. Reuse detection / password reset: revoke every session of one user.
--    BEGIN ... ROLLBACK means the UPDATE is undone, so your data is unchanged.
--    First get a real user id, copy it, and paste it below.
-- ---------------------------------------------------------------------------
SELECT user_id FROM refresh_sessions OFFSET 150000 LIMIT 1;

BEGIN;
EXPLAIN (ANALYZE, BUFFERS)
UPDATE refresh_sessions
SET revoked_at = NOW()
WHERE user_id = 'PASTE_USER_ID_HERE'
  AND revoked_at IS NULL;
ROLLBACK;


-- ---------------------------------------------------------------------------
-- 4. Every protected request: is this session alive? (lookup by primary key)
--    This one is already fast: a primary key always has an index.
-- ---------------------------------------------------------------------------
SELECT id FROM refresh_sessions OFFSET 150000 LIMIT 1;

EXPLAIN (ANALYZE, BUFFERS)
SELECT 1
FROM refresh_sessions
WHERE id = 'PASTE_SESSION_ID_HERE'
  AND revoked_at IS NULL
  AND expires_at > NOW()
LIMIT 1;


-- ---------------------------------------------------------------------------
-- 5. Later, after the app has run for a while: which indexes are NEVER used?
--    idx_scan = 0 means nobody used that index since the stats were reset.
--    An unused index only costs disk space and slows down every INSERT/UPDATE.
-- ---------------------------------------------------------------------------
SELECT relname AS table_name, indexrelname AS index_name, idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC, relname;
