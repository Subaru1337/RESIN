from fastapi import APIRouter
from app.core.config import settings

router = APIRouter()


@router.get("/health")
async def health_check():
    """
    Fast, non-blocking health check for load balancers and deployment probes (e.g. Render).
    """
    return {
        "status": "healthy",
        "service": "RESIN RAG API",
        "environment": settings.environment,
    }

