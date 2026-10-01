from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


class ChatMessage(BaseModel):
    role: str = Field(..., description="Role of the speaker: 'user' or 'assistant'", pattern="^(user|assistant|system)$")
    content: str = Field(..., min_length=1, max_length=10000, description="Message text content")

    @field_validator("content")
    @classmethod
    def sanitize_content(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Message content cannot be empty.")
        return cleaned


class ChatRequest(BaseModel):
    paper_id: Optional[str] = Field(None, max_length=200, description="Target paper UUID (optional for library chat)")
    doi: Optional[str] = Field(None, max_length=200, description="Paper DOI for exact canonical resolution")
    title: Optional[str] = Field(None, max_length=500, description="Paper title for resolution")
    message: str = Field(..., min_length=1, max_length=5000, description="User question / prompt")
    history: Optional[List[ChatMessage]] = Field(default=[], max_length=50, description="Previous conversation turns (max 50)")
    folder_id: Optional[str] = Field(None, max_length=100, description="Optional folder UUID for scoped search")

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Message cannot be empty or only whitespace.")
        return cleaned


class Citation(BaseModel):
    paper_id: Optional[str] = Field(None, description="Target paper UUID")
    paper_title: Optional[str] = Field(None, description="Title of cited paper")
    document_id: Optional[str] = Field(None, description="Document checksum or ID")
    chunk_id: Optional[str] = Field(None, description="Chunk UUID or identifier")
    chunk_index: int = Field(0, description="Index of the chunk cited")
    page_number: Optional[int] = Field(None, description="PDF page number of snippet")
    section_title: Optional[str] = Field(None, description="Section heading in the paper")
    content_snippet: str = Field(..., description="Snippet of context cited")
    similarity_score: float = Field(0.0, description="Vector similarity score")


class ChatResponse(BaseModel):
    answer: str = Field(..., description="Generated answer from RAG model")
    citations: List[Citation] = Field(default=[], description="List of source citations used")

