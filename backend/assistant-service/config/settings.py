"""Application configuration for the assistant-service.

Loads all runtime configuration from environment variables (and an optional
`.env` file) using ``pydantic-settings``. This mirrors the ``viper`` `.env`
+ environment-variable pattern used by the Go services on the platform, so the
assistant-service reads the same shared secrets (``JWT_SECRET``,
``INTERNAL_SERVICE_KEY``) and infrastructure URLs.

All AI model settings (embedding model, LLM, Ollama base URL) are read from
configuration so the platform owner can swap self-hosted models without
changing code (Requirement 12.1). The embedding dimension defaults to 768 to
match ``nomic-embed-text`` (Requirement 12.2).
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Strongly-typed settings loaded from the environment / `.env`.

    Field names map to UPPER_SNAKE_CASE environment variables case-insensitively
    (e.g. the field ``server_port`` reads ``SERVER_PORT``).
    """

    # --- HTTP server ---
    server_port: int = 8087

    # --- Shared platform auth (must match the Go services) ---
    jwt_secret: str = "my_secret_key_for_internship_project"
    internal_service_key: str = (
        "a_long_random_string_only_your_services_know_for_this_internship"
    )

    # --- RabbitMQ event consumption ---
    rabbitmq_url: str = "amqp://guest:guest@localhost:5672/"
    exchange_name: str = "sentinelai.events"
    queue_name: str = "assistant-service.events"

    # --- Redis Stack (Vector_Index + Conversation_Memory) ---
    redis_url: str = "redis://localhost:6379/0"
    vector_index_name: str = "idx:incidents"

    # --- Ollama (local embedding + LLM) ---
    ollama_base_url: str = "http://localhost:11434"
    embedding_model: str = "nomic-embed-text"
    embedding_dim: int = 768
    llm_model: str = "llama3.1:8b"

    # --- Retrieval / memory tuning ---
    retrieval_max_k: int = 5
    memory_ttl_seconds: int = 3600
    memory_max_turns: int = 10

    # --- Upstream service URLs (the four services the assistant calls) ---
    incident_service_url: str = "http://localhost:8083"
    camera_service_url: str = "http://localhost:8082"
    auth_service_url: str = "http://localhost:8081"
    analytics_service_url: str = "http://localhost:8086"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """Return a cached ``Settings`` instance.

    Cached so the `.env` file and environment are read once per process.
    """

    return Settings()
