"""Data models for the assistant-service.

Grouped into three modules:

- ``events``: pydantic models for the RabbitMQ event payloads consumed from
  incident-service (camelCase wire contract).
- ``api``: the HTTP chat request/response contract and Citation model.
- ``internal``: intermediate representations used by the indexing pipeline
  (ResolvedIncident, VectorDocument).
"""

from .api import ChatRequest, ChatResponse, Citation
from .events import CriticalAlert, IncidentCreated, IncidentStatusChanged
from .internal import ResolvedIncident, VectorDocument

__all__ = [
    # events
    "IncidentCreated",
    "IncidentStatusChanged",
    "CriticalAlert",
    # api
    "ChatRequest",
    "ChatResponse",
    "Citation",
    # internal
    "ResolvedIncident",
    "VectorDocument",
]
