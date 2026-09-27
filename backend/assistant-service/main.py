"""Application entry point for the assistant-service (design "Startup lifecycle").

This module assembles every already-implemented component into a single running
FastAPI application and owns the process-wide startup/shutdown lifecycle.

Startup sequence (FastAPI ``lifespan`` handler):

1. Load settings (:func:`config.settings.get_settings`).
2. Verify the configured Ollama models exist via
   :meth:`ollama.client.OllamaClient.ensure_models`; a missing model is logged
   with a clear, model-named error but does not abort startup so the queue can
   drain via requeue once the model appears (Req 12.4).
3. Create the ``idx:incidents`` Vector_Index if it is absent
   (:meth:`store.vector_index.VectorIndexStore.create_index`) (Req 4.6).
4. Start the RabbitMQ event consumer as a background asyncio task
   (:meth:`consumer.consumer.EventConsumer.start`) (Req 1.x, write path).
5. Launch the Backfill Runner as a background asyncio task when the backfill has
   not already completed (:meth:`backfill.runner.BackfillRunner.start`), so
   historical incidents are indexed concurrently with live events (Req 5.1, 5.2).
6. Install the fully-wired :class:`~api.chat.ChatService` via
   :func:`api.chat.set_chat_service` and mount the chat router + ``/health``.

The shared collaborators (:class:`OllamaClient`, :class:`VectorIndexStore`,
:class:`NameResolver`, :class:`IndexingPipeline`) are built **once** and shared
across the consumer and backfill runner so both write paths produce identical,
idempotent documents (Req 1.5).

Shutdown reverses startup: the consumer is stopped, the backfill task is
cancelled, and owned HTTP/Redis clients are released.

Run under Uvicorn on ``SERVER_PORT`` (8087 by default).
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI

from api import chat as chat_api
from api.chat import ChatService, build_default_chat_service, set_chat_service
from backfill.runner import BackfillRunner
from chat.analytics_client import AnalyticsClient
from chat.grounding import GroundingBuilder
from chat.memory import MemoryManager
from chat.retriever import Retriever
from config.settings import Settings, get_settings
from consumer.consumer import EventConsumer
from indexing.pipeline import IndexingPipeline
from ollama.client import OllamaClient
from resolver.name_resolver import NameResolver
from store.vector_index import VectorIndexStore

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("assistant-service")


class AppState:
    """Holds the shared, long-lived components for the process lifetime.

    Built once at startup and torn down at shutdown. Kept on ``app.state`` so
    the lifecycle handler (and any diagnostics) can reach the live instances.
    """

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        # Shared write-path collaborators (one instance, shared everywhere).
        self.ollama = OllamaClient(settings=settings)
        self.vector_store = VectorIndexStore(settings=settings)
        self.resolver = NameResolver(settings=settings)
        self.pipeline = IndexingPipeline(
            resolver=self.resolver,
            ollama=self.ollama,
            store=self.vector_store,
        )
        # Write-path drivers.
        self.consumer = EventConsumer(self.pipeline, settings=settings)
        self.backfill = BackfillRunner(self.pipeline, settings=settings)
        # Background tasks tracked for clean shutdown.
        self.backfill_task: Optional[asyncio.Task] = None
        # Read-path service.
        self.chat_service: Optional[ChatService] = None

    def build_chat_service(self) -> ChatService:
        """Assemble the read-path :class:`ChatService` reusing shared components.

        Reuses the same :class:`OllamaClient` and :class:`VectorIndexStore` that
        the write path uses, so embeddings at query time come from the identical
        model/config used at index time (Req 6.1).
        """

        memory = MemoryManager(ollama=self.ollama, settings=self.settings)
        retriever = Retriever(
            ollama_client=self.ollama,
            vector_store=self.vector_store,
            settings=self.settings,
        )
        analytics = AnalyticsClient(settings=self.settings)
        grounding = GroundingBuilder(self.ollama)
        return ChatService(
            ollama=self.ollama,
            memory=memory,
            retriever=retriever,
            analytics=analytics,
            grounding=grounding,
            settings=self.settings,
        )

    async def aclose(self) -> None:
        """Release owned clients (best effort, never raises)."""

        for label, closer in (
            ("consumer", self.consumer.stop()),
            ("resolver", self.resolver.close()),
            ("ollama", self.ollama.aclose()),
            ("backfill", self.backfill.aclose()),
        ):
            try:
                await closer
            except Exception as exc:  # noqa: BLE001 - shutdown is best effort
                logger.warning("Error closing %s: %s", label, exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan: run the startup sequence, then yield, then shut down."""

    settings = get_settings()
    logger.info("assistant-service starting on port %d", settings.server_port)

    state = AppState(settings)
    app.state.app_state = state

    # 1-2. Verify the configured Ollama models exist (Req 12.4). A missing model
    # is logged clearly but does not abort startup: the queue drains via requeue
    # once the model becomes available.
    try:
        models_ok = await state.ollama.ensure_models()
        if not models_ok:
            logger.warning(
                "One or more configured Ollama models are unavailable; the "
                "service will start but indexing will requeue until they exist."
            )
    except Exception as exc:  # noqa: BLE001 - never let the check abort startup
        logger.warning("Ollama model check failed (%s); continuing startup.", exc)

    # 3. Create the Vector_Index if absent (Req 4.6).
    try:
        created = state.vector_store.create_index()
        if created:
            logger.info("Created Vector_Index '%s'.", settings.vector_index_name)
        else:
            logger.info(
                "Vector_Index '%s' already exists.", settings.vector_index_name
            )
    except Exception as exc:  # noqa: BLE001 - surface but do not crash the app
        logger.error("Failed to create Vector_Index: %s", exc)

    # 4. Start the event consumer as a background asyncio task (write path).
    try:
        await state.consumer.start()
        logger.info("Event consumer started.")
    except Exception as exc:  # noqa: BLE001 - log; the app can still serve chat
        logger.error("Failed to start event consumer: %s", exc)

    # 5. Launch the backfill as a background task if it has not completed yet
    # (Req 5.1, 5.2). Runs concurrently with the live consumer.
    try:
        if state.backfill.is_complete():
            logger.info("Backfill already complete; not starting it.")
        else:
            state.backfill_task = state.backfill.start()
            logger.info("Backfill task launched.")
    except Exception as exc:  # noqa: BLE001 - backfill failure must not block startup
        logger.error("Failed to launch backfill: %s", exc)

    # 6. Install the fully-wired ChatService for the read path.
    state.chat_service = state.build_chat_service()
    set_chat_service(state.chat_service)
    logger.info("Chat service installed; assistant-service ready.")

    try:
        yield
    finally:
        logger.info("assistant-service shutting down...")
        if state.backfill_task is not None and not state.backfill_task.done():
            state.backfill_task.cancel()
            try:
                await state.backfill_task
            except asyncio.CancelledError:
                pass
            except Exception as exc:  # noqa: BLE001 - shutdown is best effort
                logger.warning("Backfill task ended with error: %s", exc)
        set_chat_service(None)
        await state.aclose()
        logger.info("assistant-service shutdown complete.")


def create_app() -> FastAPI:
    """Build the FastAPI application with the chat router + lifecycle mounted."""

    app = FastAPI(
        title="assistant-service",
        description="RAG chat assistant for the SentinelAI platform.",
        version="1.0.0",
        lifespan=lifespan,
    )
    # Mount the chat router (owns its own /assistant prefix) and /health.
    app.include_router(chat_api.router)
    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.server_port,
        log_level="info",
    )
