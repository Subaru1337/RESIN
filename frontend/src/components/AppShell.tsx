import { useState, useEffect } from "react";
import { NavLink } from "@/components/NavLink";
import {
  Newspaper,
  BookOpen,
  FolderOpen,
  Network,
  LogOut,
  User,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { LogoBadge } from "@/components/Logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const items = [
  { to: "/", label: "Daily Feed", icon: Newspaper },
  { to: "/papers", label: "Paper Hub", icon: BookOpen },
  { to: "/library", label: "Library", icon: FolderOpen },
  { to: "/graph", label: "Connections", icon: Network },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("resin_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("resin_sidebar_collapsed", String(collapsed));
    } catch {
      // Storage unavailable
    }
  }, [collapsed]);

  return (
    <div className="min-h-screen w-full bg-background paper-grain">
      <div className="flex min-h-screen">
        {/* Sticky Desktop Sidebar with Butter-Smooth Hardware-Accelerated Transition */}
        <aside
          className={`hidden md:flex flex-col border-r border-border bg-sidebar/95 backdrop-blur-md sticky top-0 h-screen shrink-0 z-30 transition-[width] duration-300 ease-in-out will-change-[width] select-none ${
            collapsed ? "w-[68px]" : "w-60 lg:w-64"
          }`}
        >
          {/* Header area with Logo & Toggle Button */}
          <div className="pt-5 pb-4 px-3 flex flex-col shrink-0 overflow-hidden border-b border-border/40">
            <div className="flex items-center justify-between">
              <NavLink to="/" className="flex items-center gap-3 overflow-hidden group">
                <div className="shrink-0 pl-1">
                  <LogoBadge size="md" />
                </div>
                <div
                  className={`flex flex-col leading-tight whitespace-nowrap transition-all duration-300 ease-in-out ${
                    collapsed
                      ? "w-0 opacity-0 -translate-x-3 pointer-events-none overflow-hidden"
                      : "w-28 opacity-100 translate-x-0"
                  }`}
                >
                  <span className="font-serif-display text-xl font-semibold tracking-tight text-foreground">RESIN</span>
                  <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Research Intel</span>
                </div>
              </NavLink>

              {!collapsed && (
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setCollapsed(true)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
                      aria-label="Collapse sidebar"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Collapse sidebar</TooltipContent>
                </Tooltip>
              )}
            </div>

            {collapsed && (
              <div className="flex justify-center mt-3 animate-fade-in">
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setCollapsed(false)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
                      aria-label="Expand sidebar"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Expand sidebar</TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto overflow-x-hidden">
            {items.map((it) => {
              const Icon = it.icon;
              return (
                <Tooltip key={it.to} delayDuration={100}>
                  <TooltipTrigger asChild>
                    <NavLink
                      to={it.to}
                      end={it.to === "/"}
                      className={`flex items-center h-10 rounded-lg text-sm font-medium transition-colors group relative overflow-hidden ${
                        collapsed ? "justify-center px-0 w-10 mx-auto" : "px-3 gap-3 w-full"
                      }`}
                      activeClassName="!bg-foreground !text-background shadow-ink"
                    >
                      <Icon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-105" />
                      <span
                        className={`whitespace-nowrap transition-all duration-300 ease-in-out ${
                          collapsed
                            ? "w-0 opacity-0 -translate-x-3 pointer-events-none overflow-hidden"
                            : "w-auto opacity-100 translate-x-0"
                        }`}
                      >
                        {it.label}
                      </span>
                    </NavLink>
                  </TooltipTrigger>
                  {collapsed && <TooltipContent side="right">{it.label}</TooltipContent>}
                </Tooltip>
              );
            })}
          </nav>

          {/* User profile / bottom actions */}
          <div className="p-3 border-t border-border shrink-0 overflow-hidden">
            {user && (
              collapsed ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="h-10 w-10 mx-auto rounded-lg hover:bg-sidebar-accent flex items-center justify-center transition-colors outline-none"
                      title={user.email}
                    >
                      <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center overflow-hidden">
                        {user.user_metadata?.avatar_url ? (
                          <img src={user.user_metadata.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                        ) : (
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="end" className="w-56 p-2">
                    <div className="px-2 py-1.5 border-b border-border/50 mb-1">
                      <p className="text-xs font-medium text-foreground truncate">{user.user_metadata?.full_name || "User"}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2 cursor-pointer text-xs py-2">
                      <Settings className="h-3.5 w-3.5" /> Research Interests
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => supabase?.auth.signOut()}
                      className="gap-2 cursor-pointer text-xs py-2 text-destructive focus:text-destructive"
                    >
                      <LogOut className="h-3.5 w-3.5" /> Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
                      {user.user_metadata?.avatar_url ? (
                        <img src={user.user_metadata.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                      ) : (
                        <User className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex flex-col text-xs leading-tight overflow-hidden">
                      <span className="font-medium text-foreground truncate">{user.user_metadata?.full_name || user.email}</span>
                      <span className="text-[10px] text-muted-foreground truncate">{user.email}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => navigate("/settings")}
                          className={`p-1.5 rounded-md transition-colors ${
                            loc.pathname === "/settings"
                              ? "text-foreground bg-secondary"
                              : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                          }`}
                          aria-label="Research Interests"
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Research Interests</TooltipContent>
                    </Tooltip>

                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => supabase?.auth.signOut()}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                          aria-label="Sign out"
                        >
                          <LogOut className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">Sign out</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              )
            )}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0">
          {/* Mobile top bar */}
          <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-sidebar/60 backdrop-blur-sm sticky top-0 z-30">
            <NavLink to="/" className="flex items-center gap-2">
              <LogoBadge size="sm" />
              <span className="font-serif-display text-lg font-semibold">RESIN</span>
            </NavLink>
            <nav className="flex gap-1 items-center">
              {items.map((it) => {
                const Icon = it.icon;
                const active = loc.pathname === it.to || (it.to !== "/" && loc.pathname.startsWith(it.to));
                return (
                  <NavLink
                    key={it.to}
                    to={it.to}
                    end={it.to === "/"}
                    className={`p-2 rounded-md transition-smooth ${active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-sidebar-accent"}`}
                  >
                    <Icon className="h-4 w-4" />
                  </NavLink>
                );
              })}
              {user && (
                <button onClick={() => supabase?.auth.signOut()} className="p-2 ml-1 text-muted-foreground hover:bg-secondary rounded-md">
                  <LogOut className="h-4 w-4" />
                </button>
              )}
            </nav>
          </div>

          <div className="px-4 sm:px-8 lg:px-12 py-8 max-w-6xl mx-auto animate-fade-in">{children}</div>

          {user && (
            <button
              onClick={() => supabase?.auth.signOut()}
              className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-foreground text-background px-4 py-3 shadow-lg hover:bg-foreground/90 transition-smooth"
            >
              <LogOut className="h-4 w-4" />
              <span className="text-sm font-medium">Log out</span>
            </button>
          )}
        </main>
      </div>
    </div>
  );
}
