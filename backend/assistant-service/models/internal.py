"""Internal representations used by the indexing pipeline.

These are *not* wire contracts — they are the intermediate shapes the write
path passes between its stages (resolve -> describe -> embed -> store):

- ``ResolvedIncident``: an incident whose zone/camera/guard UUIDs have been
  resolved to human names (with UUID fallbacks), ready for the Description
  Builder. Uses snake_case Python-native field names since it never crosses a
  JSON boundary.
- ``VectorDocument``: the document stored in the RediSearch Vector_Index under
  key ``incident:{id}`` — all searchable metadata plus the 768-dim embedding.

Requirements: 4.2 (stored metadata), 12.2 (768-dim embedding), 2.4/2.5
(resolved names with UUID fallback).
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class ResolvedIncident(BaseModel):
    """An incident with UUIDs resolved to human names for description building.

    The ``*_name`` fields hold the resolved human name when resolution
    succeeded, or the original UUID string as a fallback when it failed
    (Req 2.4, 2.5). The raw ``*_id`` fields are retained because they are
    stored as filterable metadata in the Vector_Index and used for role
    scoping.
    """

    model_config = ConfigDict()

    incident_id: str
    camera_id: str
    zone_id: str
    type: str
    priority: str
    status: str
    risk_score: float = 0.0

    # Resolved human names (fall back to the UUID string when unresolved).
    zone_name: str
    camera_name: str
    assigned_guard_id: Optional[str] = None
    assigned_guard_name: Optional[str] = None

    created_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None


class VectorDocument(BaseModel):
    """A document stored in the RediSearch Vector_Index (key ``incident:{id}``).

    Field names use snake_case to match the RediSearch schema
    (``incident_id`` TAG, ``created_at`` NUMERIC, ``embedding`` VECTOR, ...).
    ``doc_type`` distinguishes a normal incident document from a CriticalAlert
    document (Req 4.3).
    """

    model_config = ConfigDict()

    incident_id: str
    doc_type: str = "incident"  # "incident" | "alert"
    zone_id: str
    camera_id: Optional[str] = None
    type: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    assigned_guard_id: Optional[str] = None
    created_at: Optional[int] = None  # unix seconds (NUMERIC, SORTABLE)
    description: str = ""
    embedding: List[float] = []
