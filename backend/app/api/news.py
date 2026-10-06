import logging
from typing import Optional, List, Dict, Any
import httpx
from fastapi import APIRouter, Request, Query
from app.core.config import settings
from app.core.limiter import limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/news", tags=["News"])

_COMMON_HEADERS = {"User-Agent": "RESIN-Research-Assistant/1.0"}


async def _safe_get(
    client: httpx.AsyncClient,
    url: str,
    params: Optional[dict] = None,
    timeout: float = 8.0,
) -> Optional[httpx.Response]:
    """
    Attempt standard verified HTTPS request.
    In local dev/testing environments, fall back if local antivirus/proxy CA breaks chain.
    """
    try:
        return await client.get(url, params=params, timeout=timeout)
    except Exception as exc:
        is_prod = settings.environment.lower() == "production"
        if not is_prod:
            logger.debug(f"Verified GET to {url} failed ({exc}); trying dev unverified fallback.")
            try:
                async with httpx.AsyncClient(timeout=timeout, verify=False, headers=_COMMON_HEADERS) as fallback:
                    return await fallback.get(url, params=params)
            except Exception as inner_exc:
                logger.warning(f"Unverified fallback GET to {url} also failed: {inner_exc}")
                return None
        logger.warning(f"GET to {url} failed: {exc}")
        return None


def _map_query_to_devto_tag(q: str) -> str:
    ql = (q or "").lower().strip()
    if "robot" in ql:
        return "robotics"
    if "quantum" in ql:
        return "quantum"
    if "climate" in ql:
        return "climate"
    if "crispr" in ql or "bio" in ql:
        return "science"
    if "chip" in ql or "hardware" in ql:
        return "hardware"
    if "python" in ql:
        return "python"
    if "security" in ql or "safety" in ql:
        return "security"
    if "web" in ql:
        return "webdev"
    if "devops" in ql or "cloud" in ql:
        return "devops"
    if "machine learning" in ql or "ml" in ql:
        return "machinelearning"
    return "ai"


async def _fetch_fallback_news(query_term: str, page_size: int = 30) -> List[Dict[str, Any]]:
    """
    Fetch tech and research news from Dev.to and Hacker News (Algolia).
    Both APIs are completely free, require no API key, and return rich articles.
    """
    articles: List[Dict[str, Any]] = []
    seen_urls = set()
    is_prod = settings.environment.lower() == "production"

    async with httpx.AsyncClient(timeout=8.0, verify=is_prod, headers=_COMMON_HEADERS) as client:
        # 1. Fetch from Dev.to (rich images, summaries, and tags)
        tag = _map_query_to_devto_tag(query_term)
        try:
            resp = await _safe_get(client, f"https://dev.to/api/articles?tag={tag}&per_page=15")
            if resp and resp.status_code == 200:
                for item in resp.json():
                    url = item.get("url")
                    title = item.get("title")
                    if url and title and url not in seen_urls:
                        seen_urls.add(url)
                        articles.append({
                            "source": {"name": "DEV Community"},
                            "author": (item.get("user") or {}).get("name"),
                            "title": title,
                            "description": item.get("description"),
                            "url": url,
                            "urlToImage": item.get("cover_image") or item.get("social_image"),
                            "publishedAt": item.get("published_at"),
                            "content": item.get("description"),
                        })
        except Exception as e:
            logger.debug(f"Dev.to fallback fetch error: {e}")

        # 2. Fetch from Hacker News Algolia API (covers any keyword query)
        try:
            clean_q = query_term.replace("(", "").replace(")", "").replace(" OR ", " ").strip()
            hn_query = clean_q if clean_q else "AI"
            resp = await _safe_get(
                client,
                "https://hn.algolia.com/api/v1/search_by_date",
                params={"tags": "story", "query": hn_query, "hitsPerPage": page_size},
            )
            if resp and resp.status_code == 200:
                for h in resp.json().get("hits", []):
                    title = h.get("title")
                    item_id = h.get("objectID")
                    url = h.get("url") or (f"https://news.ycombinator.com/item?id={item_id}" if item_id else None)
                    if url and title and url not in seen_urls:
                        seen_urls.add(url)
                        points = h.get("points") or 0
                        comments = h.get("num_comments") or 0
                        articles.append({
                            "source": {"name": "Hacker News"},
                            "author": h.get("author"),
                            "title": title,
                            "description": f"{points} points | {comments} comments on Hacker News",
                            "url": url,
                            "urlToImage": None,
                            "publishedAt": h.get("created_at"),
                            "content": title,
                        })
        except Exception as e:
            logger.debug(f"Hacker News fallback fetch error: {e}")

    return articles[:page_size]


@router.get("")
@limiter.limit("30/minute")
async def get_tech_news(
    request: Request,
    q: Optional[str] = Query(None, description="Search query"),
    page_size: int = Query(30, ge=1, le=50),
):
    """
    Multi-source news feed:
    1. Primary: NewsAPI.org (if configured and reachable).
    2. Resilient Fallback: Dev.to & Hacker News APIs (free, no API key needed, always reliable).
    """
    key = settings.news_api_key
    query_term = q.strip() if q and q.strip() else "(AI OR machine learning OR robotics OR LLM OR biotech)"
    is_prod = settings.environment.lower() == "production"

    # Attempt primary NewsAPI if key is configured
    if key and key != "placeholder-key":
        url = "https://newsapi.org/v2/everything"
        params = {
            "q": query_term,
            "language": "en",
            "sortBy": "publishedAt",
            "pageSize": page_size,
            "apiKey": key,
        }

        try:
            async with httpx.AsyncClient(timeout=8.0, verify=is_prod, headers=_COMMON_HEADERS) as client:
                resp = await _safe_get(client, url, params=params)
                if resp and resp.status_code == 200:
                    data = resp.json()
                    articles = data.get("articles", [])
                    if articles:
                        return {"articles": articles}
                else:
                    status = resp.status_code if resp else "timeout/error"
                    logger.info(f"NewsAPI returned status {status}. Falling back to community feeds.")
        except Exception as e:
            logger.warning(f"NewsAPI request failed: {e}. Falling back to community feeds.")

    # Graceful fallback to free developer & research feeds (Dev.to + Hacker News)
    fallback_articles = await _fetch_fallback_news(query_term, page_size)
    return {"articles": fallback_articles}

