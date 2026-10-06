from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    supabase_url: str = Field(
        "https://placeholder-url.supabase.co",
        validation_alias=AliasChoices("SUPABASE_URL", "VITE_SUPABASE_URL"),
    )
    supabase_service_key: str = Field(
        "placeholder-key",
        validation_alias=AliasChoices("SUPABASE_SERVICE_KEY", "VITE_SUPABASE_SERVICE_KEY"),
    )
    supabase_anon_key: str = Field(
        "placeholder-key",
        validation_alias=AliasChoices("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"),
    )
    gemini_api_key: str = Field(
        "placeholder-gemini-key",
        validation_alias=AliasChoices("GEMINI_API_KEY", "VITE_GEMINI_API_KEY"),
    )
    semantic_scholar_api_key: str = Field(
        "",
        validation_alias=AliasChoices("SEMANTIC_SCHOLAR_API_KEY", "VITE_SEMANTIC_SCHOLAR_API_KEY"),
    )
    news_api_key: str = Field(
        "",
        validation_alias=AliasChoices("NEWS_API_KEY", "VITE_NEWS_API_KEY"),
    )
    
    frontend_url: str = "http://localhost:5173"
    allowed_origins: str = Field(
        "",
        validation_alias=AliasChoices("ALLOWED_ORIGINS", "CORS_ORIGINS", "FRONTEND_URL"),
    )

    @property
    def cors_origins(self) -> list[str]:
        defaults = [
            "http://localhost:5173",
            "http://localhost:8081",
            "http://localhost:3000",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:8081",
            "http://127.0.0.1:3000",
        ]
        if self.frontend_url and self.frontend_url not in defaults:
            defaults.append(self.frontend_url.rstrip("/"))
        if self.allowed_origins:
            for o in self.allowed_origins.split(","):
                cleaned = o.strip().rstrip("/")
                if cleaned and cleaned not in defaults:
                    defaults.append(cleaned)
        return defaults
    gemini_embedding_model: str = Field(
        "models/gemini-embedding-001",
        validation_alias=AliasChoices("GEMINI_EMBEDDING_MODEL", "VITE_GEMINI_EMBEDDING_MODEL"),
    )
    gemini_chat_model: str = Field(
        "models/gemini-3.5-flash-lite",
        validation_alias=AliasChoices("GEMINI_CHAT_MODEL", "VITE_GEMINI_CHAT_MODEL"),
    )
    chunk_size: int = 600
    overlap_size: int = 100
    jwt_secret: str = Field(
        "",
        validation_alias=AliasChoices("JWT_SECRET", "SUPABASE_JWT_SECRET"),
    )
    environment: str = Field(
        "development",
        validation_alias=AliasChoices("ENVIRONMENT", "ENV", "NODE_ENV"),
    )
    enable_docs: bool = Field(
        True,
        validation_alias=AliasChoices("ENABLE_DOCS", "FASTAPI_DOCS"),
    )
    max_request_body_size: int = Field(
        35 * 1024 * 1024,
        validation_alias=AliasChoices("MAX_REQUEST_BODY_SIZE"),
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
