import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from app.services.gemini_service import GeminiService
from app.core.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/summarize", tags=["Summaries"])


class SummarizeRequest(BaseModel):
    prompt: str = Field(..., max_length=100000, description="Prompt text to summarize")
    response_mime_type: Optional[str] = Field("application/json", description="Expected response format")
    temperature: Optional[float] = Field(0.3, ge=0.0, le=1.0)


class SummarizeResponse(BaseModel):
    text: str


@router.post("", response_model=SummarizeResponse)
@limiter.limit("30/minute")
async def generate_summary(request: Request, body: SummarizeRequest):
    """
    Secure server-side proxy for Gemini summaries.
    Protects GEMINI_API_KEY on the server and applies rate-limiting.
    """
    try:
        text = GeminiService.generate_content(
            prompt=body.prompt,
            response_mime_type=body.response_mime_type,
            temperature=body.temperature or 0.3,
        )
        return SummarizeResponse(text=text)
    except Exception as e:
        err_msg = str(e)
        logger.error(f"Error generating summary: {err_msg}")
        if "quota" in err_msg.lower() or "429" in err_msg.lower():
            raise HTTPException(status_code=429, detail="Summarization rate limit exceeded. Please try again later.")
        raise HTTPException(status_code=500, detail="Failed to generate summary.")
