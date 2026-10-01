from typing import Literal, List, Optional
from urllib.parse import urlparse
from pydantic import BaseModel, Field, field_validator


class IndexPaperRequest(BaseModel):
    paper_id: str = Field(..., min_length=1, max_length=200, description="UUID or identifier of the paper to chunk and embed")
    full_text: Optional[str] = Field(None, max_length=5_000_000, description="Full paper text if available")
    sections: Optional[dict] = Field(None, description="Optional section map {'Intro': '...', ...}")
    force: bool = Field(False, description="Force re-indexing even if paper chunks already exist")
    title: Optional[str] = Field(None, max_length=1000, description="Paper title")
    doi: Optional[str] = Field(None, max_length=200, description="Paper DOI")
    arxiv_id: Optional[str] = Field(None, max_length=100, description="Paper arXiv ID")
    open_access_url: Optional[str] = Field(None, max_length=2000, description="Paper open-access URL")
    abstract: Optional[str] = Field(None, max_length=30000, description="Paper abstract")

    @field_validator("paper_id")
    @classmethod
    def sanitize_paper_id(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("paper_id cannot be blank.")
        return cleaned

    @field_validator("open_access_url")
    @classmethod
    def validate_oa_url(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return v
        cleaned = v.strip()
        parsed = urlparse(cleaned)
        if parsed.scheme.lower() not in ("http", "https"):
            raise ValueError(f"Forbidden open_access_url scheme '{parsed.scheme}'. Only HTTP and HTTPS are permitted.")
        return cleaned


class ChunkInfo(BaseModel):
    chunk_index: int
    section_title: Optional[str] = None
    word_count: int


class IndexPaperResponse(BaseModel):
    paper_id: str
    canonical_paper_id: Optional[str] = None
    chunks_created: int
    chunks: List[ChunkInfo]
    status: Literal["success", "warning", "error"] = "success"
    message: str = "Paper successfully chunked and embedded."
    is_reindex: bool = Field(False, description="True if a previous partial/stale index (<5 chunks) was purged and re-indexed")
    failure_reason: Optional[str] = Field(None, description="Diagnostic failure code e.g. EMBEDDING_QUOTA_EXCEEDED, PAYWALL_DETECTED")

