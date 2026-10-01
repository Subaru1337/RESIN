from fastapi import Request
from slowapi import Limiter


def get_real_client_ip(request: Request) -> str:
    """Extract real client IP, respecting X-Forwarded-For when behind a reverse proxy (Render, Vercel, Cloudflare)."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


limiter = Limiter(key_func=get_real_client_ip)
