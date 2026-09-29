import logging
from typing import List, Optional
from app.core.supabase import get_supabase_client

logger = logging.getLogger(__name__)


def save_chat_turn(user_id: str, folder_id: Optional[str], role: str, content: str, paper_id: Optional[str] = None) -> None:
    """
    Save a single chat turn (user or assistant) to the chat_history table.
    Optionally keyed by paper_id for per-paper chat persistence.
    """
    supabase = get_supabase_client()
    if not supabase:
        logger.error("Supabase client not initialized; cannot save chat turn.")
        return
    try:
        record = {
            "user_id": user_id,
            "folder_id": folder_id,
            "role": role,
            "content": content,
        }
        if paper_id:
            record["paper_id"] = paper_id
        supabase.table("chat_history").insert(record).execute()
    except Exception as e:
        logger.error(f"Failed to save chat turn: {e}")


def load_chat_history(user_id: str, folder_id: Optional[str], limit: int = 100) -> List[dict]:
    """
    Load chat history for a user, optionally filtered by folder.
    Returns list of dicts with keys: role, content, created_at (oldest first).
    """
    supabase = get_supabase_client()
    if not supabase:
        logger.error("Supabase client not initialized; cannot load chat history.")
        return []
    try:
        query = supabase.table("chat_history").select("role,content,created_at").eq("user_id", user_id)
        if folder_id is not None:
            query = query.eq("folder_id", folder_id)
        query = query.order("created_at", desc=False).limit(limit)
        resp = query.execute()
        return resp.data or []
    except Exception as e:
        logger.error(f"Failed to load chat history: {e}")
        return []


def load_paper_chat_history(user_id: str, paper_id: str, limit: int = 200) -> List[dict]:
    """
    Load saved chat history for a specific paper scoped to the authenticated user.
    Returns list of dicts: {role, content, created_at} ordered oldest-first.
    """
    supabase = get_supabase_client()
    if not supabase:
        logger.error("Supabase client not initialized; cannot load paper chat history.")
        return []
    try:
        resp = (
            supabase.table("chat_history")
            .select("role,content,created_at")
            .eq("user_id", user_id)
            .eq("paper_id", paper_id)
            .order("created_at", desc=False)
            .limit(limit)
            .execute()
        )
        return resp.data or []
    except Exception as e:
        logger.error(f"Failed to load paper chat history for paper {paper_id}: {e}")
        return []


def clear_paper_chat_history(user_id: str, paper_id: str) -> bool:
    """Delete all saved chat turns for a specific paper+user pair."""
    supabase = get_supabase_client()
    if not supabase:
        return False
    try:
        supabase.table("chat_history").delete().eq("user_id", user_id).eq("paper_id", paper_id).execute()
        return True
    except Exception as e:
        logger.error(f"Failed to clear paper chat history for paper {paper_id}: {e}")
        return False
