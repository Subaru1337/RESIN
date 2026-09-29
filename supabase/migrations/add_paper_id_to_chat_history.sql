-- Migration: Add paper_id to chat_history for per-paper chat persistence
-- Run this in your Supabase SQL Editor

ALTER TABLE chat_history
  ADD COLUMN IF NOT EXISTS paper_id UUID REFERENCES papers(id) ON DELETE CASCADE;

-- Index for fast per-user per-paper history lookup
CREATE INDEX IF NOT EXISTS idx_chat_history_user_paper
  ON chat_history(user_id, paper_id)
  WHERE paper_id IS NOT NULL;
