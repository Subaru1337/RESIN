import hashlib
import jwt
from fastapi import Request
from slowapi import Limiter


def get_rate_limit_key(request: Request) -> str:
    """
    Extract rate-limiting key.
    If the request has an Authorization Bearer token, key by the authenticated user ID
    (or token hash) so that rotating IPs cannot bypass rate limits on user actions.
    Otherwise fall back to client IP (respecting X-Forwarded-For).
    """
    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        if token:
            try:
                unverified = jwt.decode(token, options={"verify_signature": False})
                sub = unverified.get("sub")
                if sub:
                    return f"usr:{sub}"
            except Exception:
                pass
            token_hash = hashlib.sha256(token.encode()).hexdigest()[:16]
            return f"tok:{token_hash}"

    # Fallback to IP address
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return f"ip:{forwarded.split(',')[0].strip()}"
    client_ip = request.client.host if request.client else "127.0.0.1"
    return f"ip:{client_ip}"


limiter = Limiter(key_func=get_rate_limit_key)
