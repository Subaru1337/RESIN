-- Migration: add UNIQUE constraint on feed_items.url for upsert deduplication
ALTER TABLE feed_items
  ADD CONSTRAINT IF NOT EXISTS feed_items_url_key UNIQUE (url);
