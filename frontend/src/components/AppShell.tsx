import React from "react";
import { Link } from "react-router-dom";
import {
  Newspaper,
  BookOpen,
  FolderOpen,
  Network,
  LogOut,
  Settings,
  User,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { LogoBadge } from "@/components/Logo";
import { FloatingDock, type DockItem } from "@/components/ui/floating-dock";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const dockItems: DockItem[] = [
    {
      title: "Daily Feed",
      icon: <Newspaper className="h-full w-full" />,
      href: "/",
    },
    {
      title: "Paper Hub",
      icon: <BookOpen className="h-full w-full" />,
      href: "/papers",
    },
    {
      title: "Library",
      icon: <FolderOpen className="h-full w-full" />,
      href: "/library",
    },
    {
      title: "Connections",
      icon: <Network className="h-full w-full" />,
      href: "/graph",
    },
    {
      title: "Research Interests",
      icon: <Settings className="h-full w-full" />,
      href: "/settings",
    },
  ];

  if (user) {
    dockItems.push({
      title: user.user_metadata?.full_name || user.email || "Profile",
      href: "/settings",
      icon: user.user_metadata?.avatar_url ? (
        <img
          src={user.user_metadata.avatar_url}
          alt="Avatar"
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <User className="h-full w-full" />
      ),
    });
  }

  return (
    <div className="min-h-screen w-full bg-background paper-grain text-foreground relative">
      {/* Fixed Top-Left Logo - Never Animates */}
      <header className="fixed top-5 left-6 z-50 select-none pointer-events-auto">
        <Link
          to="/"
          className="flex items-center gap-3 group cursor-pointer focus-visible:outline-none"
          aria-label="RESIN Home"
        >
          <div className="shrink-0">
            <LogoBadge
              size="md"
              className="!transform-none !transition-none hover:!scale-100 hover:!transform-none"
            />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-serif-display text-xl font-semibold tracking-tight text-foreground">
              RESIN
            </span>
            <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground font-mono">
              Research Intel
            </span>
          </div>
        </Link>
      </header>

      {/* Floating Vertical Navigation Dock on the Left */}
      <FloatingDock items={dockItems} />

      {/* Main Content Area */}
      <main className="min-h-screen w-full pl-0 md:pl-28 lg:pl-32 pr-4 sm:pr-8 py-8 pt-24 md:pt-12 max-w-7xl mx-auto animate-fade-in">
        <div className="max-w-6xl mx-auto">{children}</div>

        {/* Floating Logout Button at Bottom-Right */}
        {user && (
          <button
            onClick={() => supabase?.auth.signOut()}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-foreground text-background px-4 py-3 shadow-xl hover:bg-foreground/90 active:scale-95 transition-all select-none"
            aria-label="Log out"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-sm font-medium">Log out</span>
          </button>
        )}
      </main>
    </div>
  );
}

export default AppShell;
