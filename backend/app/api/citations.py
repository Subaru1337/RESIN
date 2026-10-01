import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from app.core.auth import get_current_user_id
from app.core.limiter import limiter
from app.services.citations import sync_citation_edges

logger = logging.getLogger(__name__)
router = APIRouter()


class SyncCitationsRequest(BaseModel):
    paper_ids: Optional[List[str]] = Field(None, max_length=100, description="Optional paper UUIDs to sync (max 100)")

    @field_validator("paper_ids")
    @classmethod
    def validate_paper_ids(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if not v:
            return v
        cleaned = [p.strip() for p in v if p and p.strip() and len(p.strip()) <= 200]
        return cleaned


@router.post("/sync-citations")
@limiter.limit("10/minute")
async def sync_citations_endpoint(
    request: Request,
    req: Optional[SyncCitationsRequest] = None,
    user_id: str = Depends(get_current_user_id),
):
    """
    Computes direct and shared citation edges for saved papers and saves them into citation_edges.
    """
    try:
        paper_ids = req.paper_ids if req else None
        res = await sync_citation_edges(paper_ids=paper_ids)
        return res
    except Exception as e:
        logger.error(f"Error syncing citations: {e}")
        raise HTTPException(status_code=500, detail=str(e))
