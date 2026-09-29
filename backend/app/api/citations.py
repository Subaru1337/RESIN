import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.citations import sync_citation_edges

logger = logging.getLogger(__name__)
router = APIRouter()


class SyncCitationsRequest(BaseModel):
    paper_ids: Optional[List[str]] = None


@router.post("/sync-citations")
async def sync_citations_endpoint(req: Optional[SyncCitationsRequest] = None):
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
