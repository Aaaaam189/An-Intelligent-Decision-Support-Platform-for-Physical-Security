"""RabbitMQ event consumer for the assistant-service write path (design section 1).

Mirrors the Go consumers (``analytics-worker``, ``decision-engine``): it declares
the shared ``sentinelai.events`` topic exchange idempotently, binds a durable
``assistant-service.events`` queue to the incident/alert routing keys, and
consumes with **manual ack**, dispatching each parseable message to the
:class:`~indexing.pipeline.IndexingPipeline`.

Routing keys consumed (Req 1.1, 1.2, 4.3):

- ``incident.created``           -> :meth:`IndexingPipeline.index_incident`
- ``incident.status_changed``    -> :meth:`IndexingPipeline.apply_status_change`
- ``alert.critical_unassigned``  -> :meth:`IndexingPipeline.index_alert`

Ack / nack policy (matches the Go workers exactly, design "Error Handling"):

+-----------------------------------------------+---------------------------+---------+
| Situation                                     | Action                    | Req     |
+===============================================+===========================+=========+
| Message body cannot be parsed                 | ``nack(requeue=False)``   | 1.3     |
| Indexing fails, transient (Ollama unavailable)| ``nack(requeue=True)``    | 4.4     |
| Indexing fails, non-retryable single incident | log + ``ack``             | 1.4     |
+-----------------------------------------------+---------------------------+---------+

The consumer runs as an asyncio task started at application startup — the Python
equivalent of ``go consumer.Start(...)`` in the Go ``main.go``. Call
:meth:`EventConsumer.start` to connect, declare topology, and begin consuming in
a background task, and :meth:`EventConsumer.stop` to shut down cleanly.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

import aio_pika
from aio_pika.abc import (
    AbstractIncomingMessage,
    AbstractRobustChannel,
    AbstractRobustConnection,
    AbstractRobustQueue,
)
from pydantic import ValidationError

from config.settings import Settings, get_settings
from indexing.pipeline import IndexingPipeline
from models.events import CriticalAlert, IncidentCreated, IncidentStatusChanged
from ollama.client import ModelUnavailableError

logger = logging.getLogger(__name__)

# Routing keys the queue binds to (must match what incident-service publishes).
ROUTING_INCIDENT_CREATED = "incident.created"
ROUTING_INCIDENT_STATUS_CHANGED = "incident.status_changed"
ROUTING_ALERT_CRITICAL_UNASSIGNED = "alert.critical_unassigned"

_ROUTING_KEYS = (
    ROUTING_INCIDENT_CREATED,
    ROUTING_INCIDENT_STATUS_CHANGED,
    ROUTING_ALERT_CRITICAL_UNASSIGNED,
)


class EventConsumer:
    """Consumes incident/alert events and drives the Indexing Pipeline.

    The consumer owns its own AMQP connection and channel (a robust connection
    that transparently reconnects). It is started once at application startup
    and dispatches messages to the shared :class:`IndexingPipeline` instance.
    """

    def __init__(
        self,
        pipeline: IndexingPipeline,
        settings: Optional[Settings] = None,
    ) -> None:
        self._pipeline = pipeline
        self._settings = settings or get_settings()
        self._connection: Optional[AbstractRobustConnection] = None
        self._channel: Optional[AbstractRobustChannel] = None
        self._queue: Optional[AbstractRobustQueue] = None
        self._consumer_tag: Optional[str] = None
        self._task: Optional[asyncio.Task] = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    async def start(self) -> asyncio.Task:
        """Connect, declare topology, and begin consuming in a background task.

        Returns the asyncio task running the consumer so the caller (the app
        startup lifecycle) can track and later cancel it. Safe to await from
        FastAPI's startup handler — it returns as soon as consumption begins.
        """

        if self._task is not None and not self._task.done():
            logger.warning("EventConsumer.start() called while already running")
            return self._task

        await self._connect()
        self._task = asyncio.create_task(self._consume(), name="assistant-event-consumer")
        return self._task

    async def _connect(self) -> None:
        """Open a robust connection/channel and declare the exchange + queue.

        The topic exchange is declared idempotently (durable) matching the Go
        side, and a durable ``assistant-service.events`` queue is bound to the
        three routing keys. A prefetch of 1 gives fair, one-at-a-time dispatch
        so a slow indexing call cannot pile up unacked messages.
        """

        self._connection = await aio_pika.connect_robust(self._settings.rabbitmq_url)
        self._channel = await self._connection.channel()
        await self._channel.set_qos(prefetch_count=1)

        # Idempotent topic exchange, durable — matches DeclareExchange in the
        # shared Go rabbitmq package.
        exchange = await self._channel.declare_exchange(
            self._settings.exchange_name,
            aio_pika.ExchangeType.TOPIC,
            durable=True,
        )

        # Durable queue bound to the incident + alert routing keys.
        self._queue = await self._channel.declare_queue(
            self._settings.queue_name,
            durable=True,
        )
        for routing_key in _ROUTING_KEYS:
            await self._queue.bind(exchange, routing_key=routing_key)

        logger.info(
            "assistant-service: bound queue '%s' to exchange '%s' on keys %s",
            self._settings.queue_name,
            self._settings.exchange_name,
            ", ".join(_ROUTING_KEYS),
        )

    async def _consume(self) -> None:
        """Consume messages until cancelled, handling each one individually."""

        assert self._queue is not None  # set by _connect()
        logger.info("assistant-service: waiting for events...")
        # Manual ack: we ack/nack explicitly in handle_message based on outcome.
        async with self._queue.iterator() as iterator:
            async for message in iterator:
                await self.handle_message(message)

    async def stop(self) -> None:
        """Cancel consumption and close the connection cleanly."""

        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

        if self._connection is not None:
            await self._connection.close()
            self._connection = None
            self._channel = None
            self._queue = None

    # ------------------------------------------------------------------
    # Message handling
    # ------------------------------------------------------------------
    async def handle_message(self, message: AbstractIncomingMessage) -> None:
        """Parse and dispatch one message, applying the ack/nack policy.

        - Unparseable body / unknown routing key -> ``nack(requeue=False)`` so
          the message is dropped without stopping consumption (Req 1.3).
        - Transient indexing failure (embedding model unavailable) ->
          ``nack(requeue=True)`` so it is retried later (Req 4.4).
        - Any other single-incident failure -> log + ``ack`` so one bad
          incident cannot block the stream (Req 1.4).
        """

        routing_key = message.routing_key

        # --- Parse ---------------------------------------------------------
        try:
            event = self._parse(routing_key, message.body)
        except (ValidationError, ValueError) as exc:
            logger.warning(
                "Rejecting unparseable message (routing_key=%s): %s",
                routing_key,
                exc,
            )
            await message.nack(requeue=False)  # Req 1.3
            return

        # --- Dispatch to the indexing pipeline -----------------------------
        try:
            await self._dispatch(routing_key, event)
        except ModelUnavailableError as exc:
            # Transient: requeue so we retry once the model is back (Req 4.4).
            logger.warning(
                "Transient indexing failure for routing_key=%s, requeueing: %s",
                routing_key,
                exc,
            )
            await message.nack(requeue=True)
            return
        except Exception as exc:  # noqa: BLE001 — isolate one bad incident
            # Non-retryable single-incident failure: log + ack so the stream
            # keeps flowing (Req 1.4).
            logger.error(
                "Non-retryable indexing failure for routing_key=%s, acking to "
                "skip: %s: %s",
                routing_key,
                type(exc).__name__,
                exc,
            )
            await message.ack()
            return

        await message.ack()

    def _parse(self, routing_key: str, body: bytes):
        """Parse a raw message body into the event model for its routing key.

        Raises:
            ValueError: The routing key is not one this consumer handles.
            ValidationError: The JSON body does not match the event schema.
        """

        text = body.decode("utf-8")
        if routing_key == ROUTING_INCIDENT_CREATED:
            return IncidentCreated.model_validate_json(text)
        if routing_key == ROUTING_INCIDENT_STATUS_CHANGED:
            return IncidentStatusChanged.model_validate_json(text)
        if routing_key == ROUTING_ALERT_CRITICAL_UNASSIGNED:
            return CriticalAlert.model_validate_json(text)
        raise ValueError(f"unhandled routing key: {routing_key!r}")

    async def _dispatch(self, routing_key: str, event) -> None:
        """Route a parsed event to the matching Indexing Pipeline method."""

        if routing_key == ROUTING_INCIDENT_CREATED:
            await self._pipeline.index_incident(event)
        elif routing_key == ROUTING_INCIDENT_STATUS_CHANGED:
            await self._pipeline.apply_status_change(event)
        elif routing_key == ROUTING_ALERT_CRITICAL_UNASSIGNED:
            await self._pipeline.index_alert(event)
        else:  # pragma: no cover - guarded by _parse
            raise ValueError(f"unhandled routing key: {routing_key!r}")
