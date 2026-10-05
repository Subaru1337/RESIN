/**
 * Gemini client (server-proxied).
 * Routes summary requests through the FastAPI backend to keep API keys secure.
 */
import type { PaperSummary } from "@/lib/types";

const RAG_BACKEND_URL = (
  (import.meta.env.VITE_RAG_BACKEND_URL as string | undefined) || "http://localhost:8000"
).replace(/\/$/, "");

export const isGeminiConfigured = Boolean(RAG_BACKEND_URL);

interface SummarizeApiResponse {
  text: string;
}

async function callGemini(prompt: string, responseMimeType: string = "application/json"): Promise<string> {
  const url = `${RAG_BACKEND_URL}/api/summarize`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      response_mime_type: responseMimeType,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    let detail = "Failed to generate summary.";
    try {
      const json = await res.json();
      if (json.detail) detail = json.detail;
    } catch {
      const text = await res.text();
      if (text) detail = text;
    }

    if (res.status === 429) {
      throw new Error("Gemini rate limit reached (429). Please wait a few seconds and try again.");
    }
    throw new Error(detail);
  }

  const json = (await res.json()) as SummarizeApiResponse;
  return json.text || "";
}

export async function generatePaperSummary(args: {
  title: string;
  abstract: string | null;
  authors: string[];
  year: number | null;
}): Promise<Omit<PaperSummary, "paper_id" | "generated_at">> {
  const prompt = `You are a research analyst. Read the paper metadata and produce a clear, plain-English structured digest.

Rules:
- Avoid jargon. Be concise and factual.
- Each field must be 1–3 sentences only.
- Do NOT add any text outside the JSON.
- If information is missing, infer cautiously or state "Not clear from provided data".

Return STRICT JSON with exactly these keys:
{
  "problem": "",
  "method": "",
  "findings": "",
  "limitations": "",
  "significance": ""
}

PAPER:
Title: ${args.title}
Authors: ${args.authors.join(", ")}
Year: ${args.year ?? "n/a"}
Abstract: ${args.abstract ?? "(no abstract available — infer from title)"}
`;

  const text = await callGemini(prompt, "application/json");
  try {
    const obj = JSON.parse(text);
    return {
      problem: obj.problem ?? null,
      method: obj.method ?? null,
      findings: obj.findings ?? null,
      limitations: obj.limitations ?? null,
      significance: obj.significance ?? null,
    };
  } catch {
    return { problem: text, method: null, findings: null, limitations: null, significance: null };
  }
}

export async function summariseArticle(title: string, description: string | null): Promise<string> {
  const prompt = `Summarize the following tech news article in EXACTLY 2 sentences and no more than 35 words total. Keep language simple, neutral, and factual. No hype, no opinions, no extra details.

Title: ${title}
Description: ${description ?? ""}

Return only the 2-sentence summary as plain text.`;
  try {
    const text = await callGemini(prompt, "text/plain");
    return text.trim() || (description ?? "");
  } catch {
    return description ?? "";
  }
}
