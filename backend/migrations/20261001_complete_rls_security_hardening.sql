-- ==============================================================================
-- RESIN: Comprehensive Row-Level Security (RLS) Hardening Migration
-- Date: 2026-10-01
-- Description:
--   Enables Row-Level Security (RLS) on all user-facing and data tables.
--   Enforces zero-trust isolation:
--     - Private user data (folders, saved papers, chat history, feed items, agent runs)
--       is strictly restricted to auth.uid() == user_id.
--     - Academic catalog data (papers, chunks, summaries, citation edges) is readable
--       by authenticated users, with writes guarded appropriately.
--   Note: In Supabase, the backend's SUPABASE_SERVICE_KEY (service_role) automatically
--   bypasses RLS, allowing server-side background ingestion and embedding operations.
-- ==============================================================================

-- 1. USERS TABLE
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
CREATE POLICY "Users can read own profile"
  ON public.users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
  ON public.users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
CREATE POLICY "Users can insert own profile"
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);


-- 2. FOLDERS TABLE
ALTER TABLE IF EXISTS public.folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own folders" ON public.folders;
CREATE POLICY "Users manage own folders"
  ON public.folders FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- 3. USER_PAPERS TABLE (User's private library state)
ALTER TABLE IF EXISTS public.user_papers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own saved papers" ON public.user_papers;
CREATE POLICY "Users manage own saved papers"
  ON public.user_papers FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- 4. CHAT_HISTORY TABLE (Private user conversation turns)
ALTER TABLE IF EXISTS public.chat_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own chat history" ON public.chat_history;
CREATE POLICY "Users manage own chat history"
  ON public.chat_history FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- 5. AGENT_RUNS & TOOL_CALLS TABLES (Autonomous research agent audit logs)
ALTER TABLE IF EXISTS public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tool_calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own agent runs" ON public.agent_runs;
CREATE POLICY "Users manage own agent runs"
  ON public.agent_runs FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view tool calls for own agent runs" ON public.tool_calls;
CREATE POLICY "Users view tool calls for own agent runs"
  ON public.tool_calls FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_runs ar
      WHERE ar.id = tool_calls.agent_run_id AND ar.user_id = auth.uid()
    )
  );


-- 6. FEED_ITEMS & DAILY_TRIAGE TABLES
-- feed_items is a global shared catalog of ingested arXiv/bioRxiv/RSS feed items (no user_id).
-- daily_triage contains per-user AI curated recommendations (has user_id).
ALTER TABLE IF EXISTS public.feed_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.daily_triage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'feed_items') THEN
    DROP POLICY IF EXISTS "Users view own feed items" ON public.feed_items;
    DROP POLICY IF EXISTS "Authenticated users can read feed items" ON public.feed_items;
    CREATE POLICY "Authenticated users can read feed items"
      ON public.feed_items FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'daily_triage') THEN
    DROP POLICY IF EXISTS "Users view own daily triage" ON public.daily_triage;
    CREATE POLICY "Users view own daily triage"
      ON public.daily_triage FOR ALL
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;


-- 7. PAPERS TABLE (Global shared academic catalog metadata)
ALTER TABLE IF EXISTS public.papers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read catalog papers" ON public.papers;
CREATE POLICY "Authenticated users can read catalog papers"
  ON public.papers FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert catalog papers" ON public.papers;
CREATE POLICY "Authenticated users can insert catalog papers"
  ON public.papers FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update catalog papers" ON public.papers;
CREATE POLICY "Authenticated users can update catalog papers"
  ON public.papers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- 8. PAPER_SUMMARIES TABLE (Shared AI summary cache)
ALTER TABLE IF EXISTS public.paper_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read paper summaries" ON public.paper_summaries;
CREATE POLICY "Authenticated users can read paper summaries"
  ON public.paper_summaries FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can upsert paper summaries" ON public.paper_summaries;
CREATE POLICY "Authenticated users can upsert paper summaries"
  ON public.paper_summaries FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- 9. CITATION_EDGES TABLE (Shared citation graph edges)
ALTER TABLE IF EXISTS public.citation_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view citation edges" ON public.citation_edges;
CREATE POLICY "Authenticated users can view citation edges"
  ON public.citation_edges FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert citation edges" ON public.citation_edges;
CREATE POLICY "Authenticated users can insert citation edges"
  ON public.citation_edges FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- 10. PAPER_CHUNKS & PAPER_EMBEDDINGS TABLES (Vector embeddings & RAG chunks)
-- Read-only for authenticated clients; insertions/updates handled via backend service_role
ALTER TABLE IF EXISTS public.paper_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.paper_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read paper chunks" ON public.paper_chunks;
CREATE POLICY "Authenticated users can read paper chunks"
  ON public.paper_chunks FOR SELECT
  TO authenticated
  USING (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'paper_embeddings') THEN
    DROP POLICY IF EXISTS "Authenticated users can read paper embeddings" ON public.paper_embeddings;
    CREATE POLICY "Authenticated users can read paper embeddings"
      ON public.paper_embeddings FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END $$;
