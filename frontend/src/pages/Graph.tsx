import { useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, type Edge, type Node, MarkerType } from "reactflow";
import "reactflow/dist/style.css";
import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listFolders, listUserPapers, listCitationEdges, computeAuthorEdges, computeTopicEdges, listPaperEmbeddings, syncCitationEdges } from "@/lib/db";
import type { Paper, CitationEdge } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { ConfigBanner } from "@/components/ConfigBanner";
import { Button } from "@/components/ui/button";
import { Network as NetworkIcon, Link2, Users, Sparkles, X, Info, RefreshCw, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const EDGE_STYLES: Record<CitationEdge["edge_type"], { color: string; dash?: string; label: string; icon: typeof Link2 }> = {
  direct_citation: { color: "hsl(var(--node-citation))", label: "Direct citation", icon: Link2 },
  shared_citation: { color: "hsl(205 75% 42%)", dash: "4 4", label: "Shared citation", icon: Link2 },
  same_author: { color: "hsl(var(--node-author))", dash: "6 4", label: "Same author", icon: Users },
  topic_similarity: { color: "hsl(var(--node-topic))", dash: "2 3", label: "Topic similarity", icon: Sparkles },
};

export default function Graph() {
  const [params] = useSearchParams();
  const initialFolder = params.get("folder");
  const [folderId, setFolderId] = useState<string | null>(initialFolder);
  const [selectedEdge, setSelectedEdge] = useState<CitationEdge | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [filters, setFilters] = useState<Record<CitationEdge["edge_type"], boolean>>({
    direct_citation: true,
    shared_citation: true,
    same_author: true,
    topic_similarity: true,
  });

  const foldersQ = useQuery({ queryKey: ["folders"], queryFn: listFolders });
  const libraryQ = useQuery({
    queryKey: ["library", folderId],
    queryFn: () => listUserPapers(folderId ?? undefined),
  });

  const papers: Paper[] = useMemo(() => (libraryQ.data ?? []).map((u) => u.paper), [libraryQ.data]);
  const paperMap = useMemo(() => new Map(papers.map((p) => [p.id, p])), [papers]);

  const dbEdgesQ = useQuery({
    queryKey: ["edges", papers.map((p) => p.id).join(",")],
    queryFn: () => listCitationEdges(papers.map((p) => p.id)),
    enabled: papers.length > 0,
  });

  const embeddingsQ = useQuery({
    queryKey: ["embeddings", papers.map((p) => p.id).join(",")],
    queryFn: () => listPaperEmbeddings(papers.map((p) => p.id)),
    enabled: papers.length > 0,
  });

  const handleSyncCitations = async () => {
    setIsSyncing(true);
    try {
      const res = await syncCitationEdges(papers.map((p) => p.id));
      await dbEdgesQ.refetch();
      toast.success(
        `Citations updated! Discovered ${res.direct_count} direct and ${res.shared_count} shared citations.`
      );
    } catch (err: any) {
      toast.error(`Sync error: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const allEdges = useMemo<CitationEdge[]>(() => {
    const author = computeAuthorEdges(papers);
    const topic = computeTopicEdges(papers, embeddingsQ.data ?? {});
    return [...(dbEdgesQ.data ?? []), ...author, ...topic];
  }, [papers, dbEdgesQ.data, embeddingsQ.data]);

  const edgeCounts = useMemo(() => {
    const counts: Record<CitationEdge["edge_type"], number> = {
      direct_citation: 0,
      shared_citation: 0,
      same_author: 0,
      topic_similarity: 0,
    };
    for (const e of allEdges) {
      if (counts[e.edge_type] !== undefined) {
        counts[e.edge_type]++;
      }
    }
    return counts;
  }, [allEdges]);

  const edges = useMemo<CitationEdge[]>(() => {
    return allEdges.filter((e) => filters[e.edge_type]);
  }, [allEdges, filters]);

  // Build React Flow nodes in a circle layout
  const nodes: Node[] = useMemo(() => {
    const n = papers.length;
    if (n === 0) return [];
    const radius = Math.max(190, n * 38);
    const maxCit = Math.max(1, ...papers.map((p) => p.citation_count));

    return papers.map((p, i) => {
      const angle = (i / n) * Math.PI * 2;
      const sizeScale = 0.6 + 0.6 * (Math.log10(p.citation_count + 1) / Math.log10(maxCit + 1));
      const size = 64 + 76 * sizeScale;
      const isConnectedToSelected = selectedEdge && (selectedEdge.paper_id_a === p.id || selectedEdge.paper_id_b === p.id);

      return {
        id: p.id,
        position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
        data: { label: p.title.length > 48 ? p.title.slice(0, 48) + "…" : p.title },
        style: {
          width: size,
          height: size,
          borderRadius: "50%",
          background: isConnectedToSelected ? "hsl(var(--accent))" : "hsl(var(--card))",
          border: isConnectedToSelected
            ? `3px solid hsl(var(--primary))`
            : `2px solid hsl(var(--primary) / 0.5)`,
          color: "hsl(var(--foreground))",
          fontSize: 10,
          fontFamily: "Fraunces, Georgia, serif",
          padding: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          boxShadow: isConnectedToSelected ? "0 0 16px hsl(var(--primary) / 0.4)" : "var(--shadow-paper)",
          transition: "all 0.2s ease",
          cursor: "pointer",
        },
      } as Node;
    });
  }, [papers, selectedEdge]);

  const flowEdges: Edge[] = useMemo(() => {
    return edges.map((e, i) => {
      const s = EDGE_STYLES[e.edge_type];
      const isSelected = selectedEdge === e;
      const strokeWidth = isSelected
        ? 3.5
        : e.edge_type === "topic_similarity"
        ? Math.max(1.5, Math.min(3, e.weight * 3))
        : e.edge_type === "shared_citation"
        ? Math.max(1.5, Math.min(3.5, 1 + Math.log2(e.weight + 1) * 0.7))
        : 1.5;

      return {
        id: `${e.paper_id_a}-${e.paper_id_b}-${e.edge_type}-${i}`,
        source: e.paper_id_a,
        target: e.paper_id_b,
        animated: e.edge_type === "direct_citation",
        style: {
          stroke: isSelected ? "hsl(var(--primary))" : s.color,
          strokeWidth,
          strokeDasharray: isSelected ? undefined : s.dash,
          opacity: selectedEdge && !isSelected ? 0.25 : 0.9,
          cursor: "pointer",
        },
        markerEnd: e.edge_type === "direct_citation" ? { type: MarkerType.ArrowClosed, color: isSelected ? "hsl(var(--primary))" : s.color } : undefined,
        data: e,
      };
    });
  }, [edges, selectedEdge]);

  useEffect(() => {
    if (initialFolder) setFolderId(initialFolder);
  }, [initialFolder]);

  const selectedPaperA = selectedEdge ? paperMap.get(selectedEdge.paper_id_a) : null;
  const selectedPaperB = selectedEdge ? paperMap.get(selectedEdge.paper_id_b) : null;

  return (
    <>
      <PageHeader
        eyebrow="Connection graph"
        title="How your saved papers connect"
        description="Explore how your research library connects through topical themes, shared authors, and citations."
      />
      <ConfigBanner />

      <div className="flex flex-wrap gap-2 mb-4 items-center justify-between animate-fade-up">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs uppercase tracking-wider text-muted-foreground mr-2">Folder:</span>
          <Button size="sm" variant={folderId === null ? "default" : "outline"} onClick={() => { setFolderId(null); setSelectedEdge(null); }} className="h-7 text-xs">
            All saved
          </Button>
          {foldersQ.data?.map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={folderId === f.id ? "default" : "outline"}
              onClick={() => { setFolderId(f.id); setSelectedEdge(null); }}
              className="h-7 text-xs"
            >
              {f.name}
            </Button>
          ))}
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={handleSyncCitations}
          disabled={isSyncing || papers.length < 2}
          className="h-7 text-xs gap-1.5"
          title="Query OpenAlex to detect direct citations and shared reference connections across your saved papers"
        >
          {isSyncing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Syncing citations...</span>
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Sync Citations</span>
            </>
          )}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {(Object.keys(EDGE_STYLES) as CitationEdge["edge_type"][]).map((k) => {
          const s = EDGE_STYLES[k];
          const Icon = s.icon;
          const count = edgeCounts[k];
          return (
            <button
              key={k}
              onClick={() => setFilters((f) => ({ ...f, [k]: !f[k] }))}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all ${
                filters[k] ? "bg-secondary border-foreground/20 text-foreground" : "bg-background border-border text-muted-foreground opacity-50"
              }`}
            >
              <span className="inline-block w-3 h-0.5" style={{ background: s.color, borderTop: s.dash ? `1px dashed ${s.color}` : undefined }} />
              <Icon className="h-3 w-3" />
              <span>{s.label}</span>
              <span className="ml-1 px-1.5 py-0.2 bg-muted text-[10px] rounded-full font-medium">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {selectedEdge && selectedPaperA && selectedPaperB && (
        <div className="mb-4 p-3.5 rounded-lg border border-primary/30 bg-primary/5 flex items-start justify-between gap-3 animate-fade-in text-xs">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: EDGE_STYLES[selectedEdge.edge_type].color }} />
              <span className="capitalize">{EDGE_STYLES[selectedEdge.edge_type].label}</span>
              {selectedEdge.edge_type === "topic_similarity" && (
                <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[11px]">
                  {Math.round(selectedEdge.weight * 100)}% match
                </span>
              )}
              {selectedEdge.edge_type === "shared_citation" && (
                <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[11px]">
                  {selectedEdge.weight} shared reference{selectedEdge.weight > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {selectedEdge.edge_type === "direct_citation" ? (
              <div className="text-xs text-foreground flex items-center gap-1.5 flex-wrap pt-0.5">
                <span className="font-semibold">{selectedPaperA.title}</span>
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-full border border-border">
                  directly cites <ArrowRight className="h-3 w-3 text-primary" />
                </span>
                <span className="font-semibold">{selectedPaperB.title}</span>
              </div>
            ) : selectedEdge.edge_type === "shared_citation" ? (
              <div className="space-y-1">
                <div className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{selectedPaperA.title}</span>
                  {" ⟷ "}
                  <span className="font-semibold text-foreground">{selectedPaperB.title}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Shared academic lineage: both papers reference <strong className="text-foreground">{selectedEdge.weight} common work{selectedEdge.weight > 1 ? "s" : ""}</strong> in their bibliographies.
                </div>
              </div>
            ) : (
              <div className="text-muted-foreground">
                <span className="font-semibold text-foreground">{selectedPaperA.title}</span>
                {" ⟷ "}
                <span className="font-semibold text-foreground">{selectedPaperB.title}</span>
              </div>
            )}

            {selectedEdge.metadata?.shared_terms && selectedEdge.metadata.shared_terms.length > 0 && (
              <div className="text-muted-foreground flex flex-wrap gap-1 items-center pt-0.5">
                <span>Shared concepts:</span>
                {selectedEdge.metadata.shared_terms.map((t) => (
                  <span key={t} className="bg-secondary px-1.5 py-0.5 rounded text-[10px] border border-border">
                    {t}
                  </span>
                ))}
              </div>
            )}
            {selectedEdge.metadata?.shared_authors && selectedEdge.metadata.shared_authors.length > 0 && (
              <div className="text-muted-foreground flex flex-wrap gap-1 items-center pt-0.5">
                <span>Shared authors:</span>
                {selectedEdge.metadata.shared_authors.map((a) => (
                  <span key={a} className="bg-secondary px-1.5 py-0.5 rounded text-[10px] border border-border">
                    {a}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setSelectedEdge(null)}
            className="text-muted-foreground hover:text-foreground p-1"
            title="Close details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden" style={{ height: 560 }}>
        {papers.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <NetworkIcon className="h-10 w-10 text-muted-foreground mb-3" />
            <div className="font-serif-display text-lg font-semibold mb-1">No saved papers to graph yet</div>
            <p className="text-sm text-muted-foreground mb-4">Save at least 2 papers to a folder to see connections.</p>
            <Button asChild size="sm" variant="outline"><Link to="/papers">Find papers</Link></Button>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={flowEdges}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
            onEdgeClick={(_, edge) => {
              if (edge.data) setSelectedEdge(edge.data);
            }}
            onPaneClick={() => setSelectedEdge(null)}
          >
            <Background gap={24} size={1} color="hsl(var(--border))" />
            <Controls className="!bg-card !border-border" />
            <MiniMap pannable zoomable className="!bg-secondary" nodeColor="hsl(var(--primary))" />
          </ReactFlow>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <div>
          {papers.length} papers · {edges.length} connections visible
          {selectedEdge && " · Click empty space to deselect connection"}
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground/80">
          <Info className="h-3 w-3" />
          <span>Click any line to see shared concepts or authors</span>
        </div>
      </div>
    </>
  );
}
