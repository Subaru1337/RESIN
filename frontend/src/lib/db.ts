import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Folder, Paper, PaperSummary, UserPaper, CitationEdge } from "@/lib/types";

/** All DB calls return null/[] if Supabase isn't configured, so the UI degrades gracefully. */

async function getUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function listFolders(): Promise<Folder[]> {
  const uid = await getUserId();
  if (!uid || !supabase) return [];
  const { data, error } = await supabase
    .from("folders")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createFolder(name: string): Promise<Folder> {
  const uid = await getUserId();
  if (!uid || !supabase) throw new Error("Not authenticated");
  
  const { data, error } = await supabase
    .from("folders")
    .insert({ name, user_id: uid })
    .select()
    .single();
  if (error) throw error;
  return data as Folder;
}

export async function deleteFolder(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from("user_papers").delete().eq("folder_id", id);
  const { error } = await supabase.from("folders").delete().eq("id", id);
  if (error) throw error;
}

/** Upsert a paper by semantic_scholar_id and return the canonical row (with uuid). */
export async function upsertPaper(p: Paper): Promise<Paper> {
  if (!supabase) throw new Error("Supabase not configured");

  const cleanDoi = p.doi ? p.doi.replace("https://doi.org/", "").trim() : null;
  const cleanS2Id = p.semantic_scholar_id ? p.semantic_scholar_id.trim() : null;
  const cleanArxiv = p.arxiv_id ? p.arxiv_id.replace(/^arxiv:/i, "").trim() : null;

  // 1. Try by DOI
  if (cleanDoi) {
    const { data: existing } = await supabase
      .from("papers")
      .select("*")
      .or(`doi.eq.${cleanDoi},doi.eq.https://doi.org/${cleanDoi}`)
      .maybeSingle();
    if (existing) return existing as Paper;
  }

  // 2. Try by semantic_scholar_id
  if (cleanS2Id) {
    const { data: existing } = await supabase
      .from("papers")
      .select("*")
      .eq("semantic_scholar_id", cleanS2Id)
      .maybeSingle();
    if (existing) return existing as Paper;
  }

  // 3. Try by arxiv_id
  if (cleanArxiv) {
    const { data: existing } = await supabase
      .from("papers")
      .select("*")
      .eq("arxiv_id", cleanArxiv)
      .maybeSingle();
    if (existing) return existing as Paper;
  }

  const payload = {
    doi: cleanDoi ?? null,
    title: p.title,
    authors: p.authors ?? [],
    year: p.year ?? null,
    abstract: p.abstract ?? null,
    citation_count: p.citation_count ?? 0,
    open_access_url: p.open_access_url ?? null,
    semantic_scholar_id: cleanS2Id ?? null,
    arxiv_id: cleanArxiv ?? null,
  };

  const { data, error } = await supabase.from("papers").insert(payload).select().single();
  if (error) {
    if (error.message.includes("papers_doi_key") && cleanDoi) {
      const { data: fb } = await supabase.from("papers").select("*").eq("doi", cleanDoi).maybeSingle();
      if (fb) return fb as Paper;
    }
    if (error.message.includes("papers_semantic_scholar_id_key") && cleanS2Id) {
      const { data: fb } = await supabase.from("papers").select("*").eq("semantic_scholar_id", cleanS2Id).maybeSingle();
      if (fb) return fb as Paper;
    }
    if (error.message.includes("papers_arxiv_id_key") && cleanArxiv) {
      const { data: fb } = await supabase.from("papers").select("*").eq("arxiv_id", cleanArxiv).maybeSingle();
      if (fb) return fb as Paper;
    }
    throw error;
  }
  return data as Paper;
}

export async function savePaperToFolder(paper: Paper, folderId: string): Promise<string> {
  const uid = await getUserId();
  if (!uid || !supabase) throw new Error("Not authenticated");
  
  const stored = await upsertPaper(paper);
  const { error } = await supabase.from("user_papers").insert({
    user_id: uid,
    paper_id: stored.id,
    folder_id: folderId,
    status: "unread",
  });
  if (error && !error.message.includes("duplicate")) throw error;
  return stored.id;
}

export async function listUserPapers(folderId?: string): Promise<(UserPaper & { paper: Paper })[]> {
  const uid = await getUserId();
  if (!uid || !supabase) return [];
  let q = supabase
    .from("user_papers")
    .select("*, paper:papers(*)")
    .eq("user_id", uid)
    .order("saved_at", { ascending: false });
  if (folderId) q = q.eq("folder_id", folderId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as (UserPaper & { paper: Paper })[];
}

export async function updateUserPaper(id: string, patch: Partial<UserPaper>): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("user_papers").update(patch).eq("id", id);
  if (error) throw error;
}

export async function removeUserPaper(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from("user_papers").delete().eq("id", id);
}

export async function getSummary(paperId: string): Promise<PaperSummary | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("paper_summaries").select("*").eq("paper_id", paperId).maybeSingle();
  return (data as PaperSummary) ?? null;
}

export async function saveSummary(s: PaperSummary): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("paper_summaries").upsert(s, { onConflict: "paper_id" });
  if (error) throw error;
}

/** Convenience alias matching supabase.ts signature: savePaperSummary(paperId, summary). */
export async function savePaperSummary(paperId: string, summary: PaperSummary): Promise<void> {
  return saveSummary({ ...summary, paper_id: paperId });
}

export async function listCitationEdges(paperIds: string[]): Promise<CitationEdge[]> {
  if (!supabase || paperIds.length === 0) return [];
  const { data, error } = await supabase
    .from("citation_edges")
    .select("*")
    .or(`paper_id_a.in.(${paperIds.join(",")}),paper_id_b.in.(${paperIds.join(",")})`);
  if (error) throw error;
  return (data ?? []).filter(
    (e: CitationEdge) => paperIds.includes(e.paper_id_a) && paperIds.includes(e.paper_id_b),
  );
}

const BACKEND_URL = import.meta.env.VITE_RAG_BACKEND_URL || "http://localhost:8000";

export async function syncCitationEdges(paperIds?: string[]): Promise<{ direct_count: number; shared_count: number; total_edges: number }> {
  let token: string | undefined;
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token;
  }

  const res = await fetch(`${BACKEND_URL}/api/citations/sync-citations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ paper_ids: paperIds ?? null }),
  });
  if (!res.ok) {
    let detail = `Citation sync failed with status ${res.status}`;
    try {
      const err = await res.json();
      if (err.detail) detail = err.detail;
    } catch {
      // ignore JSON parse error and use default status message
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function listPaperEmbeddings(paperIds: string[]): Promise<Record<string, number[]>> {
  if (!supabase || paperIds.length === 0) return {};
  try {
    const { data, error } = await supabase
      .from("paper_embeddings")
      .select("paper_id, embedding")
      .in("paper_id", paperIds);
    if (error || !data) return {};

    const map: Record<string, number[]> = {};
    for (const row of data) {
      if (!row.embedding) continue;
      if (Array.isArray(row.embedding)) {
        map[row.paper_id] = row.embedding;
      } else if (typeof row.embedding === "string") {
        try {
          map[row.paper_id] = JSON.parse(row.embedding);
        } catch {
          map[row.paper_id] = row.embedding.replace(/[[\]]/g, "").split(",").map(Number);
        }
      }
    }
    return map;
  } catch {
    return {};
  }
}

/** Compute "same_author" edges client-side from the paper list. */
export function computeAuthorEdges(papers: Paper[]): CitationEdge[] {
  const edges: CitationEdge[] = [];
  for (let i = 0; i < papers.length; i++) {
    for (let j = i + 1; j < papers.length; j++) {
      if (papers[i].id === papers[j].id) continue;
      const a = new Set(papers[i].authors.map((x) => x.toLowerCase()));
      const shared = papers[j].authors.filter((x) => a.has(x.toLowerCase()));
      if (shared.length > 0) {
        edges.push({
          paper_id_a: papers[i].id,
          paper_id_b: papers[j].id,
          edge_type: "same_author",
          weight: shared.length,
          metadata: {
            shared_authors: shared,
            label: shared.length === 1 ? `Author: ${shared[0]}` : `${shared.length} shared authors`,
          },
        });
      }
    }
  }
  return edges;
}

const ACADEMIC_STOP_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't",
  "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can",
  "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't",
  "down", "during", "each", "few", "for", "from", "further", "had", "hadn't", "has", "hasn't", "have",
  "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here", "hers", "herself", "him", "himself",
  "his", "how", "i", "i'd", "i'll", "i'm", "i've", "if", "in", "into", "is", "isn't", "it", "it's",
  "its", "itself", "let's", "me", "more", "most", "my", "myself", "no", "nor", "not", "of", "off", "on",
  "once", "only", "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same",
  "she", "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", "such", "than", "that", "that's",
  "the", "their", "theirs", "them", "themselves", "then", "there", "these", "they", "they'd", "they'll",
  "they're", "they've", "this", "those", "through", "to", "too", "under", "until", "up", "very", "was",
  "wasn't", "we", "we'd", "we'll", "we're", "we've", "were", "weren't", "what", "when", "where", "which",
  "while", "who", "whom", "why", "with", "won't", "would", "wouldn't", "you", "you'd", "you'll", "you're",
  "you've", "your", "yours", "yourself", "yourselves",
  // Academic boilerplates
  "paper", "propose", "proposed", "presents", "present", "method", "methods", "approach", "approaches",
  "model", "models", "result", "results", "show", "shows", "shown", "using", "based", "via", "into",
  "such", "well", "also", "new", "novel", "study", "analysis", "state", "art", "performance", "evaluation",
  "evaluated", "demonstrate", "demonstrates", "work", "framework", "task", "tasks", "experiment", "experiments",
  "across", "existing", "provide", "provides", "including", "overall", "recent", "high", "order"
]);

function cleanWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9-]/g, "");
}

function extractPaperFeatures(title: string, abstract: string | null): { unigrams: string[]; bigrams: string[] } {
  const text = `${title} ${abstract ?? ""}`;
  const unigrams = text
    .toLowerCase()
    .replace(/[^a-z0-9- ]/g, " ")
    .split(/\s+/)
    .map(cleanWord)
    .filter((w) => w.length > 2 && !ACADEMIC_STOP_WORDS.has(w));

  const bigrams: string[] = [];
  for (let i = 0; i < unigrams.length - 1; i++) {
    bigrams.push(`${unigrams[i]} ${unigrams[i + 1]}`);
  }
  return { unigrams, bigrams };
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  const mag = Math.sqrt(normA) * Math.sqrt(normB);
  return mag > 0 ? dot / mag : 0;
}

/** Compute "topic_similarity" edges using hybrid TF-IDF + Gemini embeddings (if available) */
export function computeTopicEdges(
  papers: Paper[],
  embeddingsMap: Record<string, number[]> = {},
  options: { threshold?: number; maxPerNode?: number } = {}
): CitationEdge[] {
  if (papers.length < 2) return [];
  const threshold = options.threshold ?? 0.12;
  const maxPerNode = options.maxPerNode ?? 4;

  // 1. Build document TF maps
  const docs = papers.map((p) => {
    const titleF = extractPaperFeatures(p.title, "");
    const absF = extractPaperFeatures("", p.abstract);
    const tf = new Map<string, number>();

    titleF.unigrams.forEach((w) => tf.set(w, (tf.get(w) || 0) + 3));
    titleF.bigrams.forEach((b) => tf.set(b, (tf.get(b) || 0) + 5));
    absF.unigrams.forEach((w) => tf.set(w, (tf.get(w) || 0) + 1));
    absF.bigrams.forEach((b) => tf.set(b, (tf.get(b) || 0) + 2));

    return { id: p.id, title: p.title, tf };
  });

  // 2. Compute Document Frequencies
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const term of doc.tf.keys()) {
      df.set(term, (df.get(term) || 0) + 1);
    }
  }

  // 3. Compute normalized TF-IDF vectors
  const N = docs.length;
  const vectors = docs.map((doc) => {
    const vec = new Map<string, number>();
    let norm = 0;
    for (const [term, freq] of doc.tf.entries()) {
      const idf = Math.log(1 + N / (df.get(term) || 1)) + 1;
      const weight = freq * idf;
      vec.set(term, weight);
      norm += weight * weight;
    }
    const mag = Math.sqrt(norm) || 1;
    for (const [term, weight] of vec.entries()) {
      vec.set(term, weight / mag);
    }
    return { id: doc.id, title: doc.title, vec };
  });

  // 4. Compute pairwise similarities
  interface CandidateEdge {
    paper_id_a: string;
    paper_id_b: string;
    score: number;
    topTerms: string[];
  }

  const candidateEdges: CandidateEdge[] = [];
  const normalizedTitle = (t: string) => t.toLowerCase().trim().replace(/[^a-z0-9]/g, "");

  for (let i = 0; i < papers.length; i++) {
    for (let j = i + 1; j < papers.length; j++) {
      const pA = papers[i];
      const pB = papers[j];

      // Skip duplicate papers
      if (pA.id === pB.id || normalizedTitle(pA.title) === normalizedTitle(pB.title)) {
        continue;
      }

      // Check vector embedding similarity first if both exist
      let embScore = 0;
      if (embeddingsMap[pA.id] && embeddingsMap[pB.id]) {
        embScore = cosineSimilarity(embeddingsMap[pA.id], embeddingsMap[pB.id]);
      }

      // Compute TF-IDF similarity
      let tfidfScore = 0;
      const sharedTerms: { term: string; contrib: number }[] = [];
      const vecA = vectors[i].vec;
      const vecB = vectors[j].vec;

      for (const [term, wA] of vecA.entries()) {
        const wB = vecB.get(term);
        if (wB) {
          const contrib = wA * wB;
          tfidfScore += contrib;
          if (contrib > 0.008) {
            sharedTerms.push({ term, contrib });
          }
        }
      }

      // Blended score
      let finalScore = tfidfScore;
      if (embScore >= 0.70) {
        // High confidence embedding match
        finalScore = Math.max(finalScore, (embScore - 0.5) * 2);
      }

      if (finalScore >= threshold) {
        sharedTerms.sort((a, b) => b.contrib - a.contrib);
        const topTerms = sharedTerms.slice(0, 3).map((x) => x.term);
        candidateEdges.push({
          paper_id_a: pA.id,
          paper_id_b: pB.id,
          score: Math.min(1, Math.round(finalScore * 100) / 100),
          topTerms,
        });
      }
    }
  }

  // 5. Prune edges per node to avoid overcrowding
  const nodeDegrees: Record<string, number> = {};
  candidateEdges.sort((a, b) => b.score - a.score);

  const edges: CitationEdge[] = [];
  for (const c of candidateEdges) {
    const degA = nodeDegrees[c.paper_id_a] || 0;
    const degB = nodeDegrees[c.paper_id_b] || 0;
    if (degA < maxPerNode && degB < maxPerNode) {
      nodeDegrees[c.paper_id_a] = degA + 1;
      nodeDegrees[c.paper_id_b] = degB + 1;
      edges.push({
        paper_id_a: c.paper_id_a,
        paper_id_b: c.paper_id_b,
        edge_type: "topic_similarity",
        weight: c.score,
        metadata: {
          shared_terms: c.topTerms,
          label: c.topTerms.length > 0
            ? `${Math.round(c.score * 100)}% match: ${c.topTerms.join(", ")}`
            : `${Math.round(c.score * 100)}% topic match`,
        },
      });
    }
  }

  return edges;
}

export { isSupabaseConfigured };
