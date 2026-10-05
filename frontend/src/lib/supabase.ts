/**
 * Supabase client. Reads keys from Vite env vars.
 * To wire your own Supabase project, create a `.env` file at frontend root with:
 *   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
 *   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
 *   VITE_RAG_BACKEND_URL=...        (FastAPI RAG backend)
 *
 * The schema expected matches your provided PostgreSQL schema (papers, paper_summaries,
 * folders, user_papers, feed_items, citation_edges, users).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && key);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, key!)
  : null;

import type { DailyTriage } from "./types";

/**
 * Ensures a user record exists in the public.users table matching the auth user.
 */
export async function ensureUserExists(authUser: { id: string; email: string }) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("users")
    .upsert(
      { id: authUser.id, email: authUser.email },
      { onConflict: "email" }
    )
    .select()
    .single();

  if (error) {
    console.error("Failed to ensure user exists:", error);
    return null;
  }
  return data;
}

export async function getDailyTriage(): Promise<DailyTriage | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("daily_triage")
    .select("*")
    .eq("user_id", user.id)
    .eq("triage_date", today)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch daily triage:", error);
    return null;
  }
  return data as DailyTriage | null;
}
