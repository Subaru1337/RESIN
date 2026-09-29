import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { toast } from "sonner";
import { CheckSquare, Square, Loader2, Save, Tags, FlaskConical, Brain, Eye, Search, Globe, Dna } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";

// Must match the topic strings tagged on feed_items by ingest-feeds.js
const TOPIC_GROUPS = [
  {
    label: "AI & Machine Learning",
    icon: Brain,
    topics: [
      "artificial intelligence",
      "machine learning",
      "deep learning",
      "reinforcement learning",
    ],
  },
  {
    label: "Language & LLMs",
    icon: Tags,
    topics: [
      "natural language processing",
      "large language models",
      "retrieval augmented generation",
      "information retrieval",
    ],
  },
  {
    label: "Computer Vision",
    icon: Eye,
    topics: [
      "computer vision",
      "image recognition",
      "object detection",
    ],
  },
  {
    label: "Science & Research",
    icon: FlaskConical,
    topics: [
      "science",
      "research",
      "biomedical",
      "clinical research",
    ],
  },
  {
    label: "Data & Search",
    icon: Search,
    topics: [
      "search",
      "data mining",
      "knowledge graphs",
    ],
  },
  {
    label: "Other Fields",
    icon: Globe,
    topics: [
      "robotics",
      "quantum computing",
      "bioinformatics",
      "neuroscience",
    ],
  },
];

// Flat list for easy lookup
const ALL_TOPICS = TOPIC_GROUPS.flatMap((g) => g.topics);

async function getUserTopics(userId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("users")
    .select("topics")
    .eq("id", userId)
    .single();
  if (error || !data) return [];
  return data.topics ?? [];
}

async function saveUserTopics(userId: string, topics: string[]): Promise<void> {
  if (!supabase) throw new Error("Supabase not configured");
  const { error } = await supabase
    .from("users")
    .update({ topics })
    .eq("id", userId);
  if (error) throw error;
}

export default function Settings() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Load existing topics on mount
  useEffect(() => {
    if (!user) return;
    getUserTopics(user.id).then((topics) => {
      setSelected(new Set(topics));
      setLoading(false);
    });
  }, [user]);

  const toggle = (topic: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return next;
    });
    setDirty(true);
  };

  const selectAll = () => {
    setSelected(new Set(ALL_TOPICS));
    setDirty(true);
  };

  const clearAll = () => {
    setSelected(new Set());
    setDirty(true);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await saveUserTopics(user.id, Array.from(selected));
      setDirty(false);
      toast.success(`Saved ${selected.size} research interest${selected.size !== 1 ? "s" : ""}. Daily triage will now use these topics.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save topics.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <PageHeader
        title="Research Interests"
        description="Select the topics you want your daily triage to follow. The feed ingestion engine uses these to surface relevant papers each morning."
      />

      {loading ? (
        <div className="flex items-center gap-3 text-muted-foreground py-12 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading your preferences...</span>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{selected.size}</span> of{" "}
              {ALL_TOPICS.length} topics selected
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs h-7">
                Select all
              </Button>
              <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs h-7">
                Clear all
              </Button>
            </div>
          </div>

          {/* Topic groups */}
          <div className="space-y-6">
            {TOPIC_GROUPS.map((group) => {
              const Icon = group.icon;
              const groupSelected = group.topics.filter((t) => selected.has(t)).length;
              return (
                <div
                  key={group.label}
                  className="border border-border rounded-xl overflow-hidden bg-card"
                >
                  {/* Group header */}
                  <div className="flex items-center gap-2.5 px-4 py-3 bg-secondary/30 border-b border-border">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">{group.label}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {groupSelected}/{group.topics.length}
                    </span>
                  </div>

                  {/* Topics grid */}
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.topics.map((topic) => {
                      const active = selected.has(topic);
                      return (
                        <button
                          key={topic}
                          onClick={() => toggle(topic)}
                          className={`flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm text-left transition-all duration-150 border ${
                            active
                              ? "bg-primary/10 border-primary/40 text-foreground font-medium"
                              : "bg-background border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground hover:bg-secondary/30"
                          }`}
                        >
                          {active ? (
                            <CheckSquare className="h-4 w-4 text-primary shrink-0" />
                          ) : (
                            <Square className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                          )}
                          <span className="capitalize">{topic}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Save bar — sticky at bottom */}
          <div
            className={`sticky bottom-6 z-10 transition-all duration-300 ${
              dirty ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
            }`}
          >
            <div className="flex items-center justify-between gap-4 bg-card/90 backdrop-blur-md border border-border rounded-xl px-5 py-3.5 shadow-lg">
              <p className="text-sm text-muted-foreground">
                You have unsaved changes.
              </p>
              <Button onClick={handleSave} disabled={saving} className="gap-2 px-5" size="sm">
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save Interests
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
