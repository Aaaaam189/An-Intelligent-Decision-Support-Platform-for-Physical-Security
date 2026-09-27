"""Pydantic models for the incident events consumed from RabbitMQ.

These models mirror **exactly** the JSON payloads published by the Go
``incident-service`` on the shared ``sentinelai.events`` topic exchange. The
Go side publishes camelCase keys (e.g. ``incidentId``, ``assignedGuardId``),
so every field here declares a camelCase ``alias`` and the models are
configured with ``populate_by_name=True`` so they can be constructed either
from the wire JSON (by alias) or from Python code (by field name).

Reference (incident-service ``incident_service.go``):

    // incident.created
    { incidentId, cameraId, zoneId, type, priority, status,
      assignedGuardId, createdAt, closedAt }
    // incident.status_changed
    { incidentId, zoneId, priority, status, assignedGuardId,
      createdAt, closedAt }
    // alert.critical_unassigned
    { incidentId, zoneId, priority, message }

Requirements: 1.1, 1.2 (events drive the indexing pipeline).
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class _EventModel(BaseModel):
    """Base for consumed events.

    ``populate_by_name`` lets us build instances by field name in tests while
    still parsing the camelCase wire format. ``extra="ignore"`` means new
    fields added by the publisher never break parsing (Req 1.3 tolerance).
    """

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class IncidentCreated(_EventModel):
    """Payload of an ``incident.created`` event.

    Matches the map published by ``publishIncidentCreated`` in incident-service.
    """

    incident_id: str = Field(alias="incidentId")
    camera_id: str = Field(alias="cameraId")
    zone_id: str = Field(alias="zoneId")
    type: str = Field(alias="type")
    priority: str = Field(alias="priority")
    status: str = Field(alias="status")
    assigned_guard_id: Optional[str] = Field(default=None, alias="assignedGuardId")
    created_at: Optional[datetime] = Field(default=None, alias="createdAt")
    closed_at: Optional[datetime] = Field(default=None, alias="closedAt")


class IncidentStatusChanged(_EventModel):
    """Payload of an ``incident.status_changed`` event.

    Matches the map published by ``publishStatusChanged`` in incident-service.
    Note that this event carries no ``cameraId`` or ``type`` — the indexing
    pipeline applies it as an update over the already-stored document.
    """

    incident_id: str = Field(alias="incidentId")
    zone_id: str = Field(alias="zoneId")
    priority: str = Field(alias="priority")
    status: str = Field(alias="status")
    assigned_guard_id: Optional[str] = Field(default=None, alias="assignedGuardId")
    created_at: Optional[datetime] = Field(default=None, alias="createdAt")
    closed_at: Optional[datetime] = Field(default=None, alias="closedAt")


class CriticalAlert(_EventModel):
    """Payload of an ``alert.critical_unassigned`` event.

    Matches the map published by ``alertCriticalUnassigned`` in incident-service.
    Indexed as a separate ``alert`` document (Req 4.3).
    """

    incident_id: str = Field(alias="incidentId")
    zone_id: str = Field(alias="zoneId")
    priority: str = Field(alias="priority")
    message: str = Field(alias="message")
