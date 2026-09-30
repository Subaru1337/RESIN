import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDailyTriage, supabase } from "@/lib/supabase";
import {
  ExternalLink,
  Loader2,
  Sparkles,
  Bot,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SaveToFolder } from "@/components/SaveToFolder";
import { PaperChat } from "@/components/PaperChat";
import { generatePaperSummary, isGeminiConfigured } from "@/lib/gemini";
import { upsertPaper, saveSummary, getSummary } from "@/lib/db";
import { toast } from "sonner";
import type { TriageItem, Paper, PaperSummary } from "@/lib/types";

const RANK_LABELS = ["#1 Pick", "#2 Pick", "#3 Pick"];
const RANK_COLORS = [
  "bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400",
  "bg-sky-500/15 border-sky-500/40 text-sky-600 dark:text-sky-400",
  "bg-violet-500/15 border-violet-500/40 text-violet-600 dark:text-violet-400",
];

function SourceBadge({ source }: { source: string }) {
  const label =
    source === "openalex"
      ? "OpenAlex"
      : source === "feed_item"
      ? "Feed"
      : source.charAt(0).toUpperCase() + source.slice(1);
  return (
    <span className="inline-block px-2 py-0.5 text-[10px] font-mono-tech tracking-wide rounded-full border border-border bg-secondary text-muted-foreground uppercase">
      {label}
    </span>
  );
}

function triageItemToPaper(item: TriageItem): Paper {
  const arxivMatch = item.url?.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]+\.[0-9]+(?:v[0-9]+)?)/i);
  const arxivId = arxivMatch ? arxivMatch[1] : null;

  const doiMatch = item.url?.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/i);
  const doi = doiMatch ? doiMatch[0] : null;

  let year: number | null = null;
  if (arxivId) {
    const yrPrefix = parseInt(arxivId.slice(0, 2), 10);
    if (!isNaN(yrPrefix)) {
      year = yrPrefix > 50 ? 1900 + yrPrefix : 2000 + yrPrefix;
    }
  }
  if (!year) {
    year = new Date().getFullYear();
  }

  const isOpenAccess = Boolean(arxivId || item.source === "openalex" || item.source === "arxiv");
  const openAccessUrl = arxivId
    ? `https://arxiv.org/pdf/${arxivId}.pdf`
    : item.url || null;

  return {
    id: item.id || `triage-${Math.random().toString(36).substring(2, 9)}`,
    title: item.title,
    doi: doi,
    authors: [],
    year: year,
    abstract: item.reason ? `Triage note: ${item.reason}` : null,
    citation_count: 0,
    open_access_url: openAccessUrl,
    is_open_access: isOpenAccess,
    semantic_scholar_id: null,
    arxiv_id: arxivId,
  };
}

function TriageAISummaryDialog({
  paper,
  summary,
  setSummary,
  ensurePersisted,
}: {
  paper: Paper;
  summary: PaperSummary | null;
  setSummary: (s: PaperSummary) => void;
  ensurePersisted: () => Promise<string>;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const sections: { key: keyof Omit<PaperSummary, "paper_id" | "generated_at">; label: string; tone: string }[] = [
    { key: "problem", label: "Problem", tone: "text-foreground" },
    { key: "method", label: "Method", tone: "text-foreground" },
    { key: "findings", label: "Findings", tone: "text-foreground" },
    { key: "limitations", label: "Limitations", tone: "text-muted-foreground" },
    { key: "significance", label: "Why it matters", tone: "text-primary font-medium" },
  ];

  const handleGenerate = async () => {
    if (!isGeminiConfigured) {
      toast.error("Add VITE_GEMINI_API_KEY to .env to generate summaries");
      return;
    }
    setLoading(true);
    try {
      const pid = await ensurePersisted();
      const out = await generatePaperSummary({
        title: paper.title,
        abstract: paper.abstract,
        authors: paper.authors,
        year: paper.year,
      });
      const next: PaperSummary = { paper_id: pid, ...out };
      setSummary(next);
      try {
        await saveSummary(next);
      } catch {
        /* non-fatal */
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate summary");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen && !summary && !loading) {
      handleGenerate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 hover:bg-secondary transition-smooth"
              aria-label="AI summary"
            >
              <Sparkles className="h-4 w-4 text-amber-500 dark:text-amber-400" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>AI summary</TooltipContent>
      </Tooltip>

      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-5 sm:p-6">
        <DialogHeader className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-7 w-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <span className="text-xs font-mono-tech uppercase tracking-wider text-muted-foreground">
              AI Structured Digest
            </span>
          </div>
          <DialogTitle className="font-serif-display text-xl leading-snug">
            {paper.title}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Plain-English structured analysis extracted by Gemini
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm font-medium">Reading paper & generating digest…</p>
            <p className="text-xs text-muted-foreground">Extracting problem, methodology, findings, and implications</p>
          </div>
        )}

        {!loading && !summary && (
          <div className="text-center py-8 space-y-3">
            <p className="text-sm text-muted-foreground">No summary generated yet.</p>
            <Button onClick={handleGenerate} size="sm" className="gap-2">
              <Sparkles className="h-3.5 w-3.5" /> Generate summary
            </Button>
          </div>
        )}

        {!loading && summary && (
          <div className="space-y-3 animate-fade-up">
            {sections.map((s) => {
              const val = summary[s.key];
              if (!val) return null;
              return (
                <div key={s.key} className="rounded-lg border border-border bg-card p-3.5 space-y-1">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {s.label}
                  </div>
                  <div className={`text-sm leading-relaxed ${s.tone}`}>
                    {val}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TriageChatDialog({
  paper,
  persistedId,
  saved,
  ensurePersisted,
}: {
  paper: Paper;
  persistedId?: string;
  saved: boolean;
  ensurePersisted: () => Promise<string>;
}) {
  const [open, setOpen] = useState(false);

  const handleOpenChange = async (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen && !persistedId) {
      await ensurePersisted();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 hover:bg-secondary transition-smooth"
              aria-label="Ask AI (RAG Chat)"
            >
              <MessageSquare className="h-4 w-4 text-primary" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Ask AI (RAG Chat)</TooltipContent>
      </Tooltip>

      <DialogContent className="max-w-2xl p-4 sm:p-6 max-h-[90vh] flex flex-col">
        <DialogHeader className="mb-2">
          <DialogTitle className="text-lg font-serif-display line-clamp-1">
            Chat with: {paper.title}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Ask questions and retrieve insights grounded in this paper using AI.
          </DialogDescription>
        </DialogHeader>
        <PaperChat paper={paper} isInLibrary={saved || Boolean(persistedId)} />
      </DialogContent>
    </Dialog>
  );
}

function TriageCard({ item, rank }: { item: TriageItem; rank: number }) {
  const [paper, setPaper] = useState<Paper>(() => triageItemToPaper(item));
  const [persistedId, setPersistedId] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const [summary, setSummary] = useState<PaperSummary | null>(null);

  useEffect(() => {
    let active = true;
    async function init() {
      const base = triageItemToPaper(item);
      if (!supabase) return;

      try {
        let existing: Paper | null = null;
        if (item.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)) {
          const { data } = await supabase.from("papers").select("*").eq("id", item.id).maybeSingle();
          if (data) existing = data as Paper;
        }
        if (!existing && base.arxiv_id) {
          const { data } = await supabase.from("papers").select("*").eq("arxiv_id", base.arxiv_id).maybeSingle();
          if (data) existing = data as Paper;
        }
        if (!existing && base.doi) {
          const { data } = await supabase.from("papers").select("*").eq("doi", base.doi).maybeSingle();
          if (data) existing = data as Paper;
        }

        if (existing) {
          if (!active) return;
          setPaper(existing);
          setPersistedId(existing.id);

          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: up } = await supabase
              .from("user_papers")
              .select("id")
              .eq("user_id", user.id)
              .eq("paper_id", existing.id)
              .maybeSingle();
            if (active && up) setSaved(true);
          }

          getSummary(existing.id).then((s) => {
            if (active && s) setSummary(s);
          }).catch(() => {});
          return;
        }

        if (item.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)) {
          const { data: fItem } = await supabase.from("feed_items").select("*").eq("id", item.id).maybeSingle();
          if (active && fItem) {
            setPaper((prev) => ({
              ...prev,
              title: fItem.title || prev.title,
              abstract: fItem.summary || prev.abstract,
              year: fItem.published_at ? new Date(fItem.published_at).getFullYear() : prev.year,
              open_access_url: prev.open_access_url || fItem.url,
            }));
          }
        }
      } catch (err) {
        console.warn("TriageCard init error:", err);
      }
    }

    init();
    return () => { active = false; };
  }, [item]);

  const ensurePersisted = async (): Promise<string> => {
    if (persistedId) return persistedId;
    try {
      const stored = await upsertPaper(paper);
      setPersistedId(stored.id);
      setPaper(stored);
      return stored.id;
    } catch (err) {
      console.warn("Failed to persist triage paper:", err);
      return paper.id;
    }
  };

  return (
    <article
      className="group relative rounded-xl border border-border bg-card hover:border-foreground/20 hover:shadow-lift transition-smooth p-5 flex flex-col gap-3 animate-fade-up"
      style={{ animationDelay: `${rank * 60}ms` }}
    >
      {/* Rank badge */}
      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${RANK_COLORS[rank]}`}
        >
          <Sparkles className="h-3 w-3" />
          {RANK_LABELS[rank]}
        </span>
        <SourceBadge source={item.source} />
      </div>

      {/* Title */}
      <h3 className="font-serif-display text-base sm:text-lg font-semibold leading-snug text-balance group-hover:text-primary transition-smooth">
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-start gap-1.5"
          >
            <span>{item.title}</span>
            <ExternalLink className="h-3.5 w-3.5 mt-1 opacity-50 shrink-0" />
          </a>
        ) : (
          item.title
        )}
      </h3>

      {/* AI reason */}
      {item.reason && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/60 rounded-lg px-3 py-2 border border-border/50">
          <Bot className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary/70" />
          <span className="leading-relaxed">{item.reason}</span>
        </div>
      )}

      {/* Action buttons toolbar: logo buttons without text */}
      <div className="mt-auto pt-3 border-t border-border/50 flex items-center justify-between">
        <span className="text-[10px] font-mono-tech uppercase tracking-wider text-muted-foreground">
          Quick actions
        </span>
        <div className="flex items-center gap-1.5">
          {/* 1. Add to folder */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <SaveToFolder
                  paper={paper}
                  summary={summary}
                  variant="icon"
                  buttonVariant="outline"
                  saved={saved}
                  onSaved={async () => {
                    setSaved(true);
                    await ensurePersisted();
                  }}
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>{saved ? "Saved in library" : "Add to folder"}</TooltipContent>
          </Tooltip>

          {/* 2. AI summary */}
          <TriageAISummaryDialog
            paper={paper}
            summary={summary}
            setSummary={setSummary}
            ensurePersisted={ensurePersisted}
          />

          {/* 3. Ask AI (RAG Chat) */}
          <TriageChatDialog
            paper={paper}
            persistedId={persistedId}
            saved={saved}
            ensurePersisted={ensurePersisted}
          />
        </div>
      </div>
    </article>
  );
}

export function DailyTriageSection() {
  const { data: triage, isLoading } = useQuery({
    queryKey: ["daily-triage"],
    queryFn: getDailyTriage,
    staleTime: 1000 * 60 * 30, // 30 min — results don't change mid-day
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading today's top picks…
      </div>
    );
  }

  if (!triage || !triage.items || triage.items.length === 0) {
    return null; // No triage for today — section simply doesn't show
  }

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <section className="mb-8 animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="h-8 w-8 rounded-lg bg-gradient-ink flex items-center justify-center shadow-ink shrink-0">
          <Sparkles className="h-4 w-4 text-paper" />
        </div>
        <div>
          <h2 className="font-serif-display text-lg font-bold leading-tight">
            Today's Top Reads
          </h2>
          <p className="text-xs text-muted-foreground">{today} · AI-curated for your library</p>
        </div>
      </div>

      {/* Cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {triage.items.slice(0, 3).map((item, i) => (
          <TriageCard key={item.id} item={item} rank={i} />
        ))}
      </div>

      {/* Divider */}
      <div className="mt-8 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground whitespace-nowrap">Search all papers</span>
        <div className="h-px flex-1 bg-border" />
      </div>
    </section>
  );
}
