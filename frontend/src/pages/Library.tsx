import { useState, useEffect, useMemo } from "react";
import { getFolders, createFolder, deleteFolder } from "@/lib/supabase";
import { listUserPapers, removeUserPaper, updateUserPaper } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/supabase";
import { PageHeader } from "@/components/PageHeader";
import { ConfigBanner } from "@/components/ConfigBanner";
import { PaperCard } from "@/components/PaperCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderPlus, FolderOpen, Trash2, Loader2, Download, FileText, BookOpen, Network, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { toBibTeX, toAPA, toMLA, downloadText } from "@/lib/cite";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Link } from "react-router-dom";
import type { Folder, UserPaper, Paper } from "@/lib/types";

export type LibrarySortOption =
  | "date_desc"
  | "date_asc"
  | "citations_desc"
  | "year_desc"
  | "year_asc"
  | "title_asc";

export default function Library() {
  const [name, setName] = useState("");
  const [activeFolder, setActiveFolder] = useState<string | null>(null);

  // Folder State
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);

  // Papers State
  const [papers, setPapers] = useState<(UserPaper & { paper: Paper })[]>([]);
  const [loadingPapers, setLoadingPapers] = useState(false);

  // Sort State (persisted per folder in localStorage)
  const [sortBy, setSortBy] = useState<LibrarySortOption>(() => {
    return (
      (localStorage.getItem(`resin_sort_${activeFolder ?? "all"}`) as LibrarySortOption) ||
      "date_desc"
    );
  });

  // Sync sort preference when active folder changes
  useEffect(() => {
    const saved = localStorage.getItem(`resin_sort_${activeFolder ?? "all"}`);
    if (saved) {
      setSortBy(saved as LibrarySortOption);
    } else {
      setSortBy("date_desc");
    }
  }, [activeFolder]);

  const handleSortChange = (newSort: LibrarySortOption) => {
    setSortBy(newSort);
    try {
      localStorage.setItem(`resin_sort_${activeFolder ?? "all"}`, newSort);
    } catch {
      // Storage unavailable or disabled
    }
  };

  // Client-side sorting (instantaneous < 200ms)
  const sortedPapers = useMemo(() => {
    const list = [...papers];
    list.sort((a, b) => {
      switch (sortBy) {
        case "date_desc": {
          const timeA = a.saved_at ? new Date(a.saved_at).getTime() : 0;
          const timeB = b.saved_at ? new Date(b.saved_at).getTime() : 0;
          return timeB - timeA;
        }
        case "date_asc": {
          const timeA = a.saved_at ? new Date(a.saved_at).getTime() : 0;
          const timeB = b.saved_at ? new Date(b.saved_at).getTime() : 0;
          return timeA - timeB;
        }
        case "citations_desc": {
          const countA = a.paper?.citation_count ?? 0;
          const countB = b.paper?.citation_count ?? 0;
          return countB - countA;
        }
        case "year_desc": {
          const yearA = a.paper?.year ?? 0;
          const yearB = b.paper?.year ?? 0;
          return yearB - yearA;
        }
        case "year_asc": {
          const yearA = a.paper?.year ?? 9999;
          const yearB = b.paper?.year ?? 9999;
          return yearA - yearB;
        }
        case "title_asc": {
          const titleA = a.paper?.title ?? "";
          const titleB = b.paper?.title ?? "";
          return titleA.localeCompare(titleB);
        }
        default:
          return 0;
      }
    });
    return list;
  }, [papers, sortBy]);

  // Load Folders
  const fetchFolders = async () => {
    if (!isSupabaseConfigured) return;
    setLoadingFolders(true);
    try {
      const data = await getFolders();
      setFolders(data);
    } catch (e) {
      toast.error("Failed to load folders");
    } finally {
      setLoadingFolders(false);
    }
  };

  useEffect(() => {
    fetchFolders();
  }, []);

  // Load Papers
  const fetchPapers = async () => {
    if (!isSupabaseConfigured) return;
    setLoadingPapers(true);
    try {
      const data = await listUserPapers(activeFolder ?? undefined);
      setPapers(data);
    } catch (e) {
      toast.error("Failed to load papers");
    } finally {
      setLoadingPapers(false);
    }
  };

  useEffect(() => {
    fetchPapers();
  }, [activeFolder]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      await createFolder(name.trim());
      setName("");
      toast.success("Folder created");
      fetchFolders();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (!confirm("Delete this folder and remove its saved papers?")) return;
    try {
      await deleteFolder(id);
      if (activeFolder === id) setActiveFolder(null);
      toast.success("Folder deleted");
      fetchFolders();
      fetchPapers(); // refresh papers in case we deleted the active folder
    } catch (e) {
      toast.error("Failed to delete folder");
    }
  };

  const handleExport = (fmt: "bib" | "apa" | "mla") => {
    const items = sortedPapers.map((up) => up.paper);
    if (!items.length) { toast.error("Nothing to export yet"); return; }
    const folderName = folders.find((f) => f.id === activeFolder)?.name ?? "library";
    const safe = folderName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    if (fmt === "bib") downloadText(`${safe}.bib`, toBibTeX(items));
    if (fmt === "apa") downloadText(`${safe}-apa.txt`, toAPA(items));
    if (fmt === "mla") downloadText(`${safe}-mla.txt`, toMLA(items));
    toast.success("Exported");
  };

  return (
    <>
      <PageHeader
        eyebrow="Personal library"
        title="Folders & saved research"
        description="Organise papers into folders, track reading status, and export citations."
        actions={
          activeFolder && (
            <>
              <Button asChild variant="outline" size="sm" className="gap-2">
                <Link to={`/graph?folder=${activeFolder}`}><Network className="h-3.5 w-3.5" /> Open graph</Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" className="gap-2"><Download className="h-3.5 w-3.5" /> Export</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleExport("bib")}>BibTeX (.bib)</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("apa")}>APA</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("mla")}>MLA</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )
        }
      />
      <ConfigBanner />

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        {/* Folders sidebar */}
        <aside className="space-y-2">
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2 px-1">Folders</div>
            <div className="flex gap-1.5 mb-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="New folder"
                className="h-8 text-sm"
              />
              <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={handleCreate}>
                <FolderPlus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="space-y-0.5">
              <button
                onClick={() => setActiveFolder(null)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-smooth ${
                  activeFolder === null ? "bg-foreground text-background" : "hover:bg-secondary"
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" /> All saved
              </button>
              
              {loadingFolders && (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              
              {!loadingFolders && folders.map((f) => (
                <div key={f.id} className="group flex items-center gap-1">
                  <button
                    onClick={() => setActiveFolder(f.id)}
                    className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-smooth text-left ${
                      activeFolder === f.id ? "bg-foreground text-background" : "hover:bg-secondary"
                    }`}
                  >
                    <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{f.name}</span>
                  </button>
                  <button
                    onClick={() => handleDeleteFolder(f.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-smooth"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {!loadingFolders && folders.length === 0 && (
                <div className="text-xs text-muted-foreground px-2 py-3 text-center">No folders yet.</div>
              )}
            </div>
          </div>
        </aside>

        {/* Papers list */}
        <section className="space-y-4">
          {/* Header toolbar with paper count and sort options */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border">
            <div className="text-sm text-muted-foreground">
              {loadingPapers ? (
                "Loading papers…"
              ) : (
                <span>
                  Showing <strong className="text-foreground font-medium">{sortedPapers.length}</strong> {sortedPapers.length === 1 ? "paper" : "papers"}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <ArrowUpDown className="h-3.5 w-3.5" /> Sort:
              </span>
              <Select value={sortBy} onValueChange={(v) => handleSortChange(v as LibrarySortOption)}>
                <SelectTrigger className="h-8 text-xs w-[190px] bg-card">
                  <SelectValue placeholder="Sort papers" />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="date_desc">Date saved (newest)</SelectItem>
                  <SelectItem value="date_asc">Date saved (oldest)</SelectItem>
                  <SelectItem value="citations_desc">Citation count (highest)</SelectItem>
                  <SelectItem value="year_desc">Year (newest)</SelectItem>
                  <SelectItem value="year_asc">Year (oldest)</SelectItem>
                  <SelectItem value="title_asc">Title (A–Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loadingPapers && (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading saved papers…
            </div>
          )}

          {!loadingPapers && sortedPapers.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-12 text-center">
              <FileText className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <div className="font-serif-display text-lg font-semibold mb-1">Nothing saved here yet</div>
              <p className="text-sm text-muted-foreground mb-4">Find papers in the Paper Hub and save them to a folder.</p>
              <Button asChild size="sm" variant="outline"><Link to="/papers">Browse papers</Link></Button>
            </div>
          )}

          <div className="grid gap-4">
            {sortedPapers.map((up) => (
              <div key={up.id} className="relative">
                <div className="absolute -left-3 top-6 hidden md:flex items-center gap-1">
                  <StatusPill
                    value={up.status}
                    onChange={async (s) => {
                      await updateUserPaper(up.id, { status: s });
                      fetchPapers();
                    }}
                  />
                </div>
                <PaperCard paper={up.paper} persistedId={up.paper.id} />
                <button
                  onClick={async () => {
                    await removeUserPaper(up.id);
                    fetchPapers();
                    toast.success("Removed");
                  }}
                  className="absolute top-3 right-12 text-xs text-muted-foreground hover:text-destructive transition-smooth"
                  title="Remove from library"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function StatusPill({ value, onChange }: { value: "unread" | "in_progress" | "done"; onChange: (s: "unread" | "in_progress" | "done") => void }) {
  const next = value === "unread" ? "in_progress" : value === "in_progress" ? "done" : "unread";
  const colors = {
    unread: "bg-muted text-muted-foreground",
    in_progress: "bg-accent/20 text-accent border-accent/40",
    done: "bg-primary/15 text-primary border-primary/40",
  } as const;
  return (
    <button
      onClick={() => onChange(next)}
      className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border border-border transition-smooth ${colors[value]}`}
      title="Click to advance status"
    >
      {value.replace("_", " ")}
    </button>
  );
}
