/**
 * News client (server-proxied).
 * Routes news requests through the FastAPI backend to keep API keys secure.
 */
import type { FeedItem } from "@/lib/types";

const RAG_BACKEND_URL = (
  (import.meta.env.VITE_RAG_BACKEND_URL as string | undefined) || "http://localhost:8000"
).replace(/\/$/, "");

export const isNewsConfigured = Boolean(RAG_BACKEND_URL);

interface NewsArticle {
  source: { name: string };
  title: string;
  url: string;
  description: string | null;
  publishedAt: string;
  urlToImage: string | null;
}

const toFeedItem = (a: NewsArticle, topics: string[]): FeedItem => ({
  id: a.url,
  source: a.source?.name ?? "Unknown",
  title: a.title,
  url: a.url,
  summary: a.description,
  published_at: a.publishedAt,
  topics,
  image_url: a.urlToImage,
});

export async function fetchTechNews(query: string, topics: string[] = []): Promise<FeedItem[]> {
  const q = encodeURIComponent(query || "(AI OR machine learning OR robotics OR LLM OR biotech)");
  const url = `${RAG_BACKEND_URL}/api/news?q=${q}&page_size=30`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return [];
    }
    const json = await res.json();
    if (!json.articles || !Array.isArray(json.articles)) {
      return [];
    }
    return (json.articles as NewsArticle[])
      .filter((a) => a.title && a.title !== "[Removed]" && a.url)
      .map((a) => toFeedItem(a, topics));
  } catch {
    return [];
  }
}
