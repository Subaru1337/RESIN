import ReactMarkdown from "react-markdown";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  MessageSquare, Send, Loader2, Sparkles, Database, Upload,
  AlertCircle, Trash2, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  askPaperRAG, checkPaperIndexStatus, indexPaper,
  uploadPaperPdf, fetchPaperChatHistory, clearPaperChatHistory,
} from "@/lib/ragApi";
import type { Paper, RagChatMessage } from "@/lib/types";
import { toast } from "sonner";

import { ReasoningText } from "@/components/ui/reasoning-text";

const RAG_SEARCH_PHRASES = [
  "Searching paper chunks",
  "Reading context passages",
  "Connecting details",
  "Forming a response",
];

const RAG_INDEX_PHRASES = [
  "Fetching paper document",
  "Extracting full text & sections",
  "Chunking semantic passages",
  "Generating vector embeddings",
];

interface PaperChatProps {
  paper: Paper;
  /** Whether this paper is saved in the user's library — only saved papers get chat persistence */
  isInLibrary?: boolean;
}

// ── Skeleton loader for chat history ──────────────────────────────
function ChatHistorySkeleton() {
  return (
    <div className="flex flex-col space-y-4 p-4 animate-pulse">
      {/* Fake user bubble */}
      <div className="flex justify-end">
        <div className="h-8 w-48 rounded-2xl bg-primary/20" />
      </div>
      {/* Fake assistant bubble */}
      <div className="flex justify-start">
        <div className="space-y-1.5">
          <div className="h-3 w-64 rounded bg-muted" />
          <div className="h-3 w-52 rounded bg-muted" />
          <div className="h-3 w-44 rounded bg-muted" />
        </div>
      </div>
      {/* Second pair */}
      <div className="flex justify-end">
        <div className="h-8 w-36 rounded-2xl bg-primary/20" />
      </div>
      <div className="flex justify-start">
        <div className="space-y-1.5">
          <div className="h-3 w-72 rounded bg-muted" />
          <div className="h-3 w-56 rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

export function PaperChat({ paper, isInLibrary = false }: PaperChatProps) {
  const [canonicalId, setCanonicalId] = useState<string>(paper.id);
  const [messages, setMessages] = useState<RagChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [indexNotice, setIndexNotice] = useState<string | null>(null);
  const [isIndexed, setIsIndexed] = useState(Boolean((paper as any).indexed_at));
  const [streaming, setStreaming] = useState(false);

  // History-load state — only relevant for library papers
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load saved chat history on mount (library papers only) ──────
  useEffect(() => {
    let mounted = true;

    // Index status check (always)
    checkPaperIndexStatus(paper.id)
      .then((res) => {
        if (!mounted) return;
        if (res.canonical_paper_id) setCanonicalId(res.canonical_paper_id);
        if (res.is_fully_indexed) {
          setIsIndexed(true);
          setIndexNotice(null);
        } else if (res.is_partial) {
          setIsIndexed(false);
          setIndexNotice(`Incomplete index (${res.chunk_count} chunk${res.chunk_count > 1 ? "s" : ""}). Will re-index on first question.`);
        } else {
          setIsIndexed(false);
        }
      })
      .catch(() => {
        if (mounted && (paper as any).indexed_at) setIsIndexed(true);
      });

    // History load (library papers only)
    if (isInLibrary) {
      setHistoryLoading(true);
      fetchPaperChatHistory(paper.id)
        .then((history) => {
          if (!mounted) return;
          if (history.length > 0) setMessages(history);
          setHistoryLoaded(true);
        })
        .catch(() => {
          if (mounted) setHistoryLoaded(true); // silently fail — show empty state
        })
        .finally(() => {
          if (mounted) setHistoryLoading(false);
        });
    } else {
      setHistoryLoaded(true);
    }

    return () => { mounted = false; };
  }, [paper.id, isInLibrary]);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => { scrollToBottom(); }, [messages, loading]);

  // ── Clear chat history ───────────────────────────────────────────
  const handleClearHistory = async () => {
    if (messages.length === 0) return;
    setMessages([]);
    await clearPaperChatHistory(canonicalId || paper.id);
    toast.success("Chat history cleared.");
  };

  // ── File upload ──────────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadPaperPdf(canonicalId || paper.id, file);
      if (res.canonical_paper_id) setCanonicalId(res.canonical_paper_id);
      setIsIndexed(true);
      setIndexNotice(null);
      toast.success(res.message || "PDF uploaded & indexed!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload PDF.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── Manual re-index ──────────────────────────────────────────────
  const handleIndexPaper = async () => {
    setIndexing(true);
    try {
      const res = await indexPaper(paper.id, {
        abstract: paper.abstract || undefined,
        force: true,
        title: paper.title,
        doi: paper.doi,
        arxivId: paper.arxiv_id,
        openAccessUrl: paper.open_access_url,
      });
      if (res.canonical_paper_id) setCanonicalId(res.canonical_paper_id);
      if (res.status === "error" || (res.chunks_created === 0 && res.failure_reason === "EMBEDDING_QUOTA_EXCEEDED")) {
        setIsIndexed(false);
        setIndexNotice(res.message);
        toast.error(res.message);
      } else if (res.status === "warning" || res.chunks_created <= 1) {
        setIsIndexed(res.chunks_created > 0);
        setIndexNotice(res.message);
        toast.warning(res.message);
      } else {
        setIsIndexed(true);
        setIndexNotice(null);
        toast.success(res.message || "Paper indexed successfully.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to index paper.");
    } finally {
      setIndexing(false);
    }
  };

  // ── Send a message ───────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;
    const userMessage = input.trim();
    setInput("");

    const newHistory: RagChatMessage[] = [...messages, { role: "user", content: userMessage }];
    setMessages(newHistory);
    setLoading(true);
    setStreaming(false);
    setLoadingStatus("Verifying paper indexing...");

    try {
      let activeTargetId = canonicalId || paper.id;

      if (!isIndexed) {
        setLoadingStatus("Fetching & indexing paper...");
        const indexRes = await indexPaper(paper.id, {
          abstract: paper.abstract || undefined,
          force: false,
          title: paper.title,
          doi: paper.doi,
          arxivId: paper.arxiv_id,
          openAccessUrl: paper.open_access_url,
        });
        if (indexRes.canonical_paper_id) {
          activeTargetId = indexRes.canonical_paper_id;
          setCanonicalId(indexRes.canonical_paper_id);
        }
        if (indexRes.status === "error" || indexRes.chunks_created === 0) {
          setIsIndexed(false);
          setLoading(false);
          setStreaming(false);
          setLoadingStatus(null);
          const errText = indexRes.message || "Failed to index paper content.";
          if (indexRes.failure_reason === "EMBEDDING_QUOTA_EXCEEDED") toast.error(errText);
          else toast.warning(errText);
          setIndexNotice(errText);
          setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ **Indexing Notice:** ${errText}` }]);
          return;
        }
        setIsIndexed(true);
        if (indexRes.is_reindex) toast.info(indexRes.message || "Re-indexed paper.");
      }

      setLoadingStatus("Searching paper chunks & generating answer...");
      const response = await askPaperRAG(activeTargetId, userMessage, newHistory, paper.doi, paper.title);
      setMessages([...newHistory, { role: "assistant", content: response.answer, citations: response.citations }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to get answer.");
    } finally {
      setLoading(false);
      setStreaming(false);
      setLoadingStatus(null);
    }
  }, [input, loading, isIndexed, messages, canonicalId, paper.id, paper.doi, paper.title]);

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[500px] border border-border rounded-xl bg-card overflow-hidden shadow-sm">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-secondary/30 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Interactive Paper Q&A</span>
          {isInLibrary && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-medium">
              <History className="h-3 w-3" /> Saved
            </span>
          )}
          {streaming && <span className="text-[10px] text-primary animate-pulse">Streaming</span>}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Clear history (library only, when there are messages) */}
          {isInLibrary && messages.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleClearHistory}
              className="text-xs h-7 gap-1 text-muted-foreground hover:text-destructive"
              title="Clear saved chat history for this paper"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}

          <input type="file" ref={fileInputRef} accept="application/pdf" className="hidden" onChange={handleFileUpload} />
          <Button
            size="sm" variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || indexing}
            className="text-xs h-7 gap-1 text-primary border-primary/30 hover:bg-primary/10"
            title="Upload full PDF for paywalled or custom papers"
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            Upload PDF
          </Button>

          <Button
            size="sm" variant="ghost"
            onClick={handleIndexPaper}
            disabled={indexing || uploading}
            className="text-xs h-7 gap-1"
          >
            {indexing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Database className="h-3 w-3 text-muted-foreground" />}
            {isIndexed ? "Re-index" : "Index Paper"}
          </Button>
        </div>
      </div>

      {/* Paywall / Incomplete Index Notice */}
      {indexNotice && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-3.5 py-2 text-xs text-amber-600 dark:text-amber-400 flex items-center justify-between gap-2 animate-fade-in">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span className="truncate">{indexNotice}</span>
          </div>
          <Button
            size="sm" variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            className="h-5 text-[11px] px-2 text-primary font-semibold underline underline-offset-2 shrink-0 hover:bg-transparent"
          >
            Upload PDF
          </Button>
        </div>
      )}

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto text-sm">
        {/* Skeleton while loading saved history */}
        {historyLoading ? (
          <ChatHistorySkeleton />
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground space-y-2 p-6">
            <Sparkles className="h-8 w-8 text-primary/60 animate-pulse" />
            <p className="font-medium text-foreground">Ask anything about this research paper</p>
            <p className="text-xs max-w-xs">
              {isInLibrary
                ? "Your conversation is automatically saved and will be here next time."
                : "Powered by section-aware RAG vector search & Gemini LLM."}
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex flex-col space-y-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground font-medium"
                      : "bg-secondary/60 text-foreground border border-border"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed space-y-2">
                      <ReactMarkdown>{msg.content || ""}</ReactMarkdown>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}

            {loading && !streaming && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-secondary/50 border border-border/60 w-fit backdrop-blur-sm shadow-sm">
                <ReasoningText
                  phrases={
                    loadingStatus?.toLowerCase().includes("indexing")
                      ? RAG_INDEX_PHRASES
                      : RAG_SEARCH_PHRASES
                  }
                  variant="cascade"
                />
              </div>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="p-3 bg-background border-t border-border flex items-center gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder={historyLoading ? "Loading history..." : "Ask a question about this paper..."}
          disabled={loading || historyLoading}
          className="flex-1 text-sm bg-card"
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={loading || !input.trim() || historyLoading}
          className="gap-1 px-3"
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
