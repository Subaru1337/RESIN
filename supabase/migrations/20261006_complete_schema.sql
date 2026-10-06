-- ==============================================================================
-- RESIN: Complete Consolidated Database Schema
-- File: supabase/migrations/20261006_complete_schema.sql
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. USERS
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  topics text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz DEFAULT now()
);

-- 3. PAPERS (Academic Catalog)
CREATE TABLE IF NOT EXISTS public.papers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doi text UNIQUE,
  title text NOT NULL,
  authors text[] DEFAULT '{}'::text[],
  year integer,
  abstract text,
  citation_count integer DEFAULT 0,
  open_access_url text,
  semantic_scholar_id text UNIQUE,
  arxiv_id text UNIQUE,
  full_text text,
  indexed_at timestamptz,
  indexing_status text,
  indexing_error text,
  fts tsvector GENERATED ALWAYS AS (to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(abstract, ''))) STORED,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_papers_fts ON public.papers USING gin(fts);
CREATE INDEX IF NOT EXISTS idx_papers_doi ON public.papers(doi);
CREATE INDEX IF NOT EXISTS idx_papers_arxiv_id ON public.papers(arxiv_id);

-- 4. FOLDERS (User Library Organization)
CREATE TABLE IF NOT EXISTS public.folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_folders_user_id ON public.folders(user_id);

-- 5. PAPER SUMMARIES
CREATE TABLE IF NOT EXISTS public.paper_summaries (
  paper_id uuid PRIMARY KEY REFERENCES public.papers(id) ON DELETE CASCADE,
  problem text,
  method text,
  findings text,
  limitations text,
  significance text,
  generated_at timestamptz DEFAULT now()
);

-- 6. PAPER EMBEDDINGS (Paper-level Semantic Vectors, 768-dim)
CREATE TABLE IF NOT EXISTS public.paper_embeddings (
  paper_id uuid PRIMARY KEY REFERENCES public.papers(id) ON DELETE CASCADE,
  embedding vector(768) NOT NULL
);

-- 7. USER PAPERS (Saved Library Items)
CREATE TABLE IF NOT EXISTS public.user_papers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  paper_id uuid NOT NULL REFERENCES public.papers(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES public.folders(id) ON DELETE SET NULL,
  notes text,
  status text DEFAULT 'unread' CHECK (status IN ('unread', 'in_progress', 'done')),
  saved_at timestamptz DEFAULT now(),
  CONSTRAINT user_papers_user_paper_unique UNIQUE (user_id, paper_id)
);

CREATE INDEX IF NOT EXISTS idx_user_papers_user_folder ON public.user_papers(user_id, folder_id);

-- 8. FEED ITEMS (RSS / News Feed Stream)
CREATE TABLE IF NOT EXISTS public.feed_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  title text NOT NULL,
  url text NOT NULL UNIQUE,
  summary text,
  image_url text,
  topics text[] DEFAULT '{}'::text[],
  published_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feed_items_published_at ON public.feed_items(published_at DESC);

-- 9. CITATION EDGES (Citation Graph)
CREATE TABLE IF NOT EXISTS public.citation_edges (
  paper_id_a uuid NOT NULL REFERENCES public.papers(id) ON DELETE CASCADE,
  paper_id_b uuid NOT NULL REFERENCES public.papers(id) ON DELETE CASCADE,
  edge_type text NOT NULL CHECK (edge_type IN ('direct_citation', 'shared_citation', 'same_author', 'topic_similarity')),
  weight double precision DEFAULT 1.0,
  CONSTRAINT citation_edges_pkey PRIMARY KEY (paper_id_a, paper_id_b, edge_type)
);

-- 10. DAILY TRIAGE (Personalized Daily Briefings)
CREATE TABLE IF NOT EXISTS public.daily_triage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  triage_date date NOT NULL DEFAULT CURRENT_DATE,
  items jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT daily_triage_user_date_unique UNIQUE (user_id, triage_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_triage_user_date ON public.daily_triage(user_id, triage_date);

-- 11. PAPER CHUNKS (RAG Vector Chunks, 768-dim)
CREATE TABLE IF NOT EXISTS public.paper_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_id uuid NOT NULL REFERENCES public.papers(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  section_title text,
  content text NOT NULL,
  embedding vector(768),
  word_count integer,
  page_number integer,
  document_id text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT paper_chunks_paper_chunk_unique UNIQUE (paper_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_paper_chunks_paper_id ON public.paper_chunks(paper_id);

-- 12. CHAT HISTORY (Per-User / Per-Paper Conversations)
CREATE TABLE IF NOT EXISTS public.chat_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  paper_id uuid REFERENCES public.papers(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES public.folders(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_history_user_paper ON public.chat_history(user_id, paper_id) WHERE paper_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_history_user_folder ON public.chat_history(user_id, folder_id, created_at);

-- 13. AGENT RUNS
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'RUNNING',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- 14. TOOL CALLS
CREATE TABLE IF NOT EXISTS public.tool_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  arguments jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'SUCCESS',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tool_calls_agent_run ON public.tool_calls(agent_run_id);

-- ==============================================================================
-- 15. VECTOR SIMILARITY SEARCH FUNCTIONS (RPC)
-- ==============================================================================

-- Vector match function for chunk-level RAG search
CREATE OR REPLACE FUNCTION public.match_paper_chunks(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 5,
  filter_paper_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  paper_id uuid,
  chunk_index int,
  section_title text,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pc.id,
    pc.paper_id,
    pc.chunk_index,
    pc.section_title,
    pc.content,
    1 - (pc.embedding <=> query_embedding) AS similarity
  FROM public.paper_chunks pc
  WHERE
    (filter_paper_id IS NULL OR pc.paper_id = filter_paper_id)
    AND 1 - (pc.embedding <=> query_embedding) > match_threshold
  ORDER BY pc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Vector match function for paper-level embeddings
CREATE OR REPLACE FUNCTION public.match_paper_embeddings(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 5,
  filter_user_id uuid DEFAULT NULL,
  filter_folder_id uuid DEFAULT NULL
)
RETURNS TABLE (
  paper_id uuid,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pe.paper_id,
    1 - (pe.embedding <=> query_embedding) AS similarity
  FROM public.paper_embeddings pe
  LEFT JOIN public.user_papers up ON up.paper_id = pe.paper_id
  WHERE
    (filter_user_id IS NULL OR up.user_id = filter_user_id)
    AND (filter_folder_id IS NULL OR up.folder_id = filter_folder_id)
    AND 1 - (pe.embedding <=> query_embedding) > match_threshold
  ORDER BY pe.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ==============================================================================
-- 16. ROW-LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_triage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.papers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citation_edges ENABLE ROW LEVEL SECURITY;

-- User Profile Policies
CREATE POLICY "Users read own profile" ON public.users FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.users FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Folders
CREATE POLICY "Users manage own folders" ON public.folders FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- User Papers (Library)
CREATE POLICY "Users manage own library" ON public.user_papers FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Chat History
CREATE POLICY "Users manage own chats" ON public.chat_history FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Daily Triage
CREATE POLICY "Users read own triage" ON public.daily_triage FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Agent Runs & Tool Calls
CREATE POLICY "Users view own agent runs" ON public.agent_runs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users view own tool calls" ON public.tool_calls FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.agent_runs ar WHERE ar.id = tool_calls.agent_run_id AND ar.user_id = auth.uid())
);

-- Public / Catalog Tables (Readable by authenticated users)
CREATE POLICY "Authenticated users read papers" ON public.papers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users read chunks" ON public.paper_chunks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users read summaries" ON public.paper_summaries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users read feeds" ON public.feed_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users read citations" ON public.citation_edges FOR SELECT TO authenticated USING (true);
