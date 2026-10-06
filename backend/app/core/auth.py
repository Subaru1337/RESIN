import logging
from typing import Optional
import jwt
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.core.config import settings
from app.core.supabase import get_supabase_client

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)


def get_current_user_id(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> str:
    """
    Validate Supabase Bearer token and return the authenticated user's UUID.
    
    Security guarantees:
    1. Rejects unauthenticated requests with HTTP 401 Unauthorized (no dummy fallbacks).
    2. If JWT_SECRET is configured, verifies the HMAC-SHA256 signature locally.
    3. If JWT_SECRET is not yet configured, securely validates the token via Supabase Auth API.
    4. Rejects forged, expired, or malformed tokens.
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required: missing or empty Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials.strip()

    # 1. Cryptographic HMAC verification if JWT secret is configured
    if settings.jwt_secret:
        try:
            payload = jwt.decode(
                token,
                settings.jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False, "verify_signature": True},
            )
            user_id = payload.get("sub")
            if not user_id:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token: missing subject (sub) claim.",
                )
            return user_id
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication token has expired. Please sign in again.",
            )
        except jwt.PyJWTError as e:
            logger.warning(f"JWT signature verification failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token.",
            )

    # 2. Secure remote verification via Supabase Auth API (fallback when JWT_SECRET not in env)
    client = get_supabase_client()
    if client:
        try:
            user_response = client.auth.get_user(token)
            if user_response and user_response.user and user_response.user.id:
                return user_response.user.id
        except Exception as e:
            logger.warning(f"Supabase auth validation rejected token: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired session. Please sign in again.",
            )

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate authentication credentials with Supabase.",
    )

