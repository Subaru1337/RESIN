/**
 * RESIN Feed Ingestion Script — ingest-feeds.js
 * ================================================
 * Pulls articles from free academic RSS/Atom feeds and upserts them
 * into the `feed_items` table in Supabase so the daily-triage.js
 * script has a rich, up-to-date pool of candidates to recommend.
 *
 * Sources (all free, no API key needed):
 *   1. arXiv  — newest CS/AI/ML preprints (Atom feed, filtered by category)
 *   2. Semantic Scholar Research Blog (RSS)
 *   3. Google Scholar Alerts  — if you have a URL, paste it in FEEDS below
 *   4. PubMed Recent  — latest biomedical literature (RSS)
 *   5. Nature News & Comment (RSS)
 *
 * Usage:
 *   node ingest-feeds.js            # ingest all feeds
 *   node ingest-feeds.js --dry-run  # print items, don't write to DB
 *
 * Schedule:  Run this BEFORE daily-triage.js (e.g. 06:00, then triage at 07:00).
 */

import 'dotenv/config';
import pkg from 'pg';
const { Client } = pkg;

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const DB_URL = process.env.SUPABASE_DB_URL;
const DRY_RUN = process.argv.includes('--dry-run');

if (!DB_URL && !DRY_RUN) {
  console.error('Missing SUPABASE_DB_URL. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

/**
 * Feed definitions.
 * Each entry: { url, source, topics[] }
 *
 * topics[] must match the strings stored in users.topics so the triage
 * query (`topics && $1::text[]`) can find them.
 *
 * Add/remove entries freely — no code changes needed elsewhere.
 */
const FEEDS = [
  // arXiv — Artificial Intelligence
  {
    url: 'https://rss.arxiv.org/rss/cs.AI',
    source: 'arxiv',
    topics: ['artificial intelligence', 'machine learning'],
  },
  // arXiv — Machine Learning
  {
    url: 'https://rss.arxiv.org/rss/cs.LG',
    source: 'arxiv',
    topics: ['machine learning', 'deep learning', 'reinforcement learning'],
  },
  // arXiv — Computation and Language (NLP)
  {
    url: 'https://rss.arxiv.org/rss/cs.CL',
    source: 'arxiv',
    topics: ['natural language processing', 'large language models'],
  },
  // arXiv — Computer Vision and Pattern Recognition
  {
    url: 'https://rss.arxiv.org/rss/cs.CV',
    source: 'arxiv',
    topics: ['computer vision', 'image recognition', 'object detection'],
  },
  // arXiv — Information Retrieval (RAG, search, recommender systems)
  {
    url: 'https://rss.arxiv.org/rss/cs.IR',
    source: 'arxiv',
    topics: ['information retrieval', 'retrieval augmented generation', 'search', 'data mining', 'knowledge graphs'],
  },
  // arXiv — Robotics
  {
    url: 'https://rss.arxiv.org/rss/cs.RO',
    source: 'arxiv',
    topics: ['robotics'],
  },
  // arXiv — Quantum Physics
  {
    url: 'https://rss.arxiv.org/rss/quant-ph',
    source: 'arxiv',
    topics: ['quantum computing'],
  },
  // PubMed Recent — general biomedical
  {
    url: 'https://pubmed.ncbi.nlm.nih.gov/rss/search/1-6LuLl-6YFM8W8VocFYPGOjEFerJCRYINanxWUU7bPn3SuTU8J/?limit=15&utm_campaign=pubmed-2&fc=20230101000000',
    source: 'pubmed',
    topics: ['biomedical', 'clinical research'],
  },
  // Nature News & Comment
  {
    url: 'https://www.nature.com/nature.rss',
    source: 'nature',
    topics: ['science', 'research'],
  },
];

// ─── XML PARSER (zero dependencies) ──────────────────────────────────────────

/**
 * Tiny RSS/Atom parser that works without any npm package.
 * Handles both RSS <item> and Atom <entry> tags.
 */
function extractText(xml, tag) {
  // Try CDATA first, then plain text
  const cdataRe = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i');
  const plainRe = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(cdataRe) || xml.match(plainRe);
  return m ? m[1].trim() : null;
}

function extractAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}[^>]+${attr}=["']([^"']+)["']`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse an RSS or Atom XML string into an array of item objects.
 */
function parseFeed(xml) {
  const items = [];

  // Split on either <item> (RSS) or <entry> (Atom)
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>|<entry[\s>]([\s\S]*?)<\/entry>/gi;
  let match;

  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1] || match[2];

    const title = stripHtml(extractText(block, 'title'));
    if (!title || title.length < 5) continue;

    // URL: RSS uses <link>, Atom uses <link href="..."> or <link>...</link>
    let url =
      extractAttr(block, 'link', 'href') ||
      extractText(block, 'link') ||
      extractText(block, 'id');
    if (!url || !url.startsWith('http')) continue;

    // Summary: try description, summary, content
    const rawSummary =
      extractText(block, 'description') ||
      extractText(block, 'summary') ||
      extractText(block, 'content');
    const summary = rawSummary ? stripHtml(rawSummary).slice(0, 800) : null;

    // Published date
    const pubRaw =
      extractText(block, 'pubDate') ||
      extractText(block, 'published') ||
      extractText(block, 'updated') ||
      extractText(block, 'dc:date');
    const published_at = pubRaw ? new Date(pubRaw).toISOString() : null;

    items.push({ title, url, summary, published_at });
  }

  return items;
}

// ─── FETCH + INGEST ───────────────────────────────────────────────────────────

async function fetchFeed(feedDef) {
  const { url, source, topics } = feedDef;
  console.log(`  Fetching ${source}: ${url}`);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'RESIN-FeedIngestion/1.0 (academic research aggregator)',
        'Accept': 'application/rss+xml, application/atom+xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(12000), // 12s timeout
    });
    if (!res.ok) {
      console.warn(`    HTTP ${res.status} — skipping`);
      return [];
    }
    const xml = await res.text();
    const items = parseFeed(xml);
    console.log(`    Parsed ${items.length} items`);
    return items.map(item => ({ ...item, source, topics }));
  } catch (err) {
    console.warn(`    Error fetching feed: ${err.message} — skipping`);
    return [];
  }
}

async function upsertItems(client, items) {
  if (items.length === 0) return 0;

  // Deduplicate by URL locally first to merge topics and avoid intra-batch duplicate key errors
  const map = new Map();
  for (const item of items) {
    if (!map.has(item.url)) {
      map.set(item.url, { ...item, topics: Array.isArray(item.topics) ? [...item.topics] : [] });
    } else {
      const existing = map.get(item.url);
      if (Array.isArray(item.topics)) {
        for (const t of item.topics) {
          if (!existing.topics.includes(t)) existing.topics.push(t);
        }
      }
      if (!existing.summary && item.summary) existing.summary = item.summary;
    }
  }
  const uniqueItems = Array.from(map.values());
  console.log(`  Deduplicated to ${uniqueItems.length} unique items across all feeds.`);

  const BATCH_SIZE = 50;
  let inserted = 0;

  for (let i = 0; i < uniqueItems.length; i += BATCH_SIZE) {
    const batch = uniqueItems.slice(i, i + BATCH_SIZE);
    const valuePlaceholders = [];
    const values = [];

    batch.forEach((item, idx) => {
      const offset = idx * 6;
      valuePlaceholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, now())`);
      values.push(item.source, item.title, item.url, item.summary || null, item.published_at || null, item.topics || []);
    });

    const query = `
      INSERT INTO feed_items (source, title, url, summary, published_at, topics, created_at)
      VALUES ${valuePlaceholders.join(',\n')}
      ON CONFLICT (url)
      DO UPDATE SET
        summary    = COALESCE(EXCLUDED.summary, feed_items.summary),
        topics     = (
          SELECT array_agg(DISTINCT t)
          FROM unnest(feed_items.topics || EXCLUDED.topics) t
        ),
        created_at = now()
    `;

    try {
      await client.query(query, values);
      inserted += batch.length;
      process.stdout.write(`\r  Upserting to DB: ${inserted}/${uniqueItems.length} items (${Math.round((inserted / uniqueItems.length) * 100)}%)...`);
    } catch (err) {
      console.warn(`\n  Batch starting at ${i} failed (${err.message}). Retrying items individually...`);
      for (const item of batch) {
        try {
          await client.query(
            `INSERT INTO feed_items (source, title, url, summary, published_at, topics, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, now())
             ON CONFLICT (url)
             DO UPDATE SET
               summary    = COALESCE(EXCLUDED.summary, feed_items.summary),
               topics     = (
                 SELECT array_agg(DISTINCT t)
                 FROM unnest(feed_items.topics || EXCLUDED.topics) t
               ),
               created_at = now()`,
            [item.source, item.title, item.url, item.summary || null, item.published_at || null, item.topics || []]
          );
          inserted++;
        } catch {
          // ignore single item failure
        }
      }
    }
  }
  console.log('');
  return inserted;
}

async function deleteOldItems(client, daysToKeep = 3) {
  // Keep only last N days to prevent unbounded growth
  const { rowCount } = await client.query(
    `DELETE FROM feed_items WHERE created_at < now() - ($1 || ' days')::interval`,
    [daysToKeep]
  );
  console.log(`  Pruned ${rowCount} items older than ${daysToKeep} days.`);
}

async function run() {
  console.log('=== RESIN Feed Ingestion ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE'}`);
  console.log(`Feeds: ${FEEDS.length}`);
  console.log('');

  // Fetch all feeds (in parallel, max 5 at a time)
  const allItems = [];
  for (let i = 0; i < FEEDS.length; i += 5) {
    const batch = FEEDS.slice(i, i + 5);
    const results = await Promise.all(batch.map(fetchFeed));
    results.forEach(items => allItems.push(...items));
  }

  console.log(`\nTotal items fetched: ${allItems.length}`);

  // Filter: skip items with no URL or title
  const validItems = allItems.filter(
    item => item.title && item.url && item.url.startsWith('http')
  );
  console.log(`Valid items after filter: ${validItems.length}`);

  if (DRY_RUN) {
    console.log('\n--- DRY RUN: Sample items ---');
    validItems.slice(0, 5).forEach(item => {
      console.log(`  [${item.source}] ${item.title.slice(0, 80)}`);
      console.log(`    URL: ${item.url}`);
      console.log(`    Topics: ${item.topics.join(', ')}`);
      console.log(`    Published: ${item.published_at || 'unknown'}`);
      console.log('');
    });
    console.log('Done (dry run — nothing written).');
    return;
  }

  // Connect and write
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  console.log('\nConnected to Supabase.');

  const inserted = await upsertItems(client, validItems);
  console.log(`Upserted ${inserted} items into feed_items.`);

  await deleteOldItems(client, 3);

  await client.end();
  console.log('\nDone.');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
