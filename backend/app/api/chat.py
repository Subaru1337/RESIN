import json
import logging
import queue
import threading
import time
from typing import Generator, Optional
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from app.agent.agent import ResearchAgent
from app.core.auth import get_current_user_id
from app.core.limiter import limiter
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.chat_service import (
    clear_paper_chat_history,
    load_chat_history,
    load_paper_chat_history,
    save_chat_turn,
)
from app.services.rag import RAGService

from app.core.timing import StageTimer, logger as timing_logger

logger = logging.getLogger(__name__)

router = APIRouter()
rag_service = RAGService()
research_agent = ResearchAgent()


@router.post("/chat", response_model=ChatResponse)
@limiter.limit("20/minute")
def chat_endpoint(
    request: Request,
    payload: ChatRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Synchronous single-paper RAG Q&A with Redis response caching."""
    timer = StageTimer()
    try:
        if payload.paper_id:
            from app.services.paper_resolution import resolve_paper_record
            canonical_id, _ = resolve_paper_record(
                paper_id=payload.paper_id,
                doi=payload.doi,
                title=payload.title,
            )

            response = rag_service.answer_question(
                paper_id=canonical_id,
                question=payload.message,
                history=payload.history,
                timer=timer,
            )

            save_chat_turn(user_id, None, "user", payload.message, paper_id=canonical_id)
            save_chat_turn(user_id, None, "assistant", response.answer, paper_id=canonical_id)
            return response

        # If paper_id is omitted, delegate to ResearchAgent
        save_chat_turn(user_id, payload.folder_id, "user", payload.message)
        response = research_agent.execute_agent_loop(
            user_id=user_id,
            user_prompt=payload.message,
            folder_id=payload.folder_id,
            history=payload.history,
        )
        save_chat_turn(user_id, payload.folder_id, "assistant", response.answer)
        return response
    finally:
        timing_logger.info(f"[{timer.request_id}] SUMMARY: {timer.summary()}")


@router.post("/chat/stream")
@limiter.limit("20/minute")
def chat_stream_endpoint(
    request: Request,
    payload: ChatRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Server-Sent Events streaming RAG & Agent endpoint."""
    timer = StageTimer()
    if payload.paper_id:
        from app.services.paper_resolution import resolve_paper_record
        canonical_id, _ = resolve_paper_record(
            paper_id=payload.paper_id,
            doi=payload.doi,
            title=payload.title,
        )

        return StreamingResponse(
            rag_service.stream_answer(
                paper_id=canonical_id,
                question=payload.message,
                history=payload.history,
                timer=timer,
                user_id=user_id,
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    # Stream agent execution events for multi-paper / library research
    def agent_event_generator() -> Generator[str, None, None]:
        q: queue.Queue = queue.Queue()

        def event_callback(event_dict: dict):
            q.put(event_dict)

        def run_agent():
            try:
                save_chat_turn(user_id, payload.folder_id, "user", payload.message)
                res = research_agent.execute_agent_loop(
                    user_id=user_id,
                    user_prompt=payload.message,
                    folder_id=payload.folder_id,
                    history=payload.history,
                    on_event=event_callback,
                )
                save_chat_turn(user_id, payload.folder_id, "assistant", res.answer)
            except Exception as e:
                logger.exception(f"Unhandled error in agent research stream: {e}")
                q.put({"type": "error", "message": "An error occurred during agent research execution."})
            finally:
                q.put(None)  # Sentinel to end stream

        t = threading.Thread(target=run_agent, daemon=True)
        t.start()

        start_time = time.time()
        max_duration_seconds = 180.0
        while True:
            if time.time() - start_time > max_duration_seconds:
                payload_str = json.dumps({"type": "error", "message": "Research stream reached maximum execution duration."})
                yield f"data: {payload_str}\n\n"
                break
            try:
                evt = q.get(timeout=2.0)
            except queue.Empty:
                continue

            if evt is None:
                break
            payload_str = json.dumps(evt)
            yield f"data: {payload_str}\n\n"

    return StreamingResponse(agent_event_generator(), media_type="text/event-stream")


@router.post("/folder_chat", response_model=ChatResponse)
@limiter.limit("20/minute")
def folder_chat_endpoint(
    request: Request,
    payload: ChatRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Autonomous Agentic Research Assistant Q&A over library or folder.
    Executes search, OA PDF discovery, ingestion, 2-stage retrieval, and citations.
    """
    save_chat_turn(user_id, payload.folder_id, "user", payload.message)

    response = research_agent.execute_agent_loop(
        user_id=user_id,
        user_prompt=payload.message,
        folder_id=payload.folder_id,
        history=payload.history,
    )

    save_chat_turn(user_id, payload.folder_id, "assistant", response.answer)
    return response


@router.get("/folder_chat_history")
def get_folder_chat_history(
    folder_id: Optional[str] = None,
    user_id: str = Depends(get_current_user_id),
):
    """Retrieve chat history for a user, optionally filtered by folder."""
    history = load_chat_history(user_id, folder_id, limit=200)
    return {"history": history}


@router.get("/chat/history/{paper_id}")
def get_paper_chat_history(
    paper_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Retrieve saved chat history for a specific paper (library papers only)."""
    history = load_paper_chat_history(user_id, paper_id, limit=200)
    return {"history": history}


@router.delete("/chat/history/{paper_id}")
def delete_paper_chat_history(
    paper_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Clear all saved chat turns for a specific paper."""
    success = clear_paper_chat_history(user_id, paper_id)
    return {"cleared": success}
