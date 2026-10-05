import logging
from typing import Optional
import httpx
from fastapi import APIRouter, Request, Query
from app.core.config import settings
from app.core.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/news", tags=["News"])


@router.get("")
@limiter.limit("30/minute")
async def get_tech_news(
    request: Request,
    q: Optional[str] = Query(None, description="Search query"),
    page_size: int = Query(30, ge=1, le=50),
):
    """
    Server-side proxy for NewsAPI.org.
    Protects NEWS_API_KEY on the server and works reliably in production.
    """
    key = settings.news_api_key
    if not key or key == "placeholder-key":
        return {"articles": []}

    query_term = q.strip() if q and q.strip() else "(AI OR machine learning OR robotics OR LLM OR biotech)"
    url = "https://newsapi.org/v2/everything"
    params = {
        "q": query_term,
        "language": "en",
        "sortBy": "publishedAt",
        "pageSize": page_size,
        "apiKey": key,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, params=params)
            if resp.status_code == 200:
                data = resp.json()
                return {"articles": data.get("articles", [])}

            logger.warning(f"NewsAPI returned status {resp.status_code}: {resp.text}")
            return {"articles": []}
    except Exception as e:
        logger.error(f"Failed to fetch tech news from NewsAPI: {e}")
        return {"articles": []}
