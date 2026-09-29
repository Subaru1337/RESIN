-- Migration: add topics column to users table for research interests
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS topics text[] NOT NULL DEFAULT '{}';
