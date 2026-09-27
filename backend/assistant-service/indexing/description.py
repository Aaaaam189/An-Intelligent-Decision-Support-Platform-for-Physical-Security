"""Description Builder for the assistant-service indexing (write) path.

Turns a :class:`~models.internal.ResolvedIncident` — an incident whose
zone/camera/guard UUIDs have already been resolved to human names (with UUID
fallbacks) — into a single human-readable Incident_Description sentence
(Requirement 3). The description is what gets embedded, so it must express the
incident's *meaning* in plain words rather than raw codes.

This module is a **pure function**: it takes a ``ResolvedIncident`` and returns
a ``str``. It performs no I/O of any kind, which makes it directly
property-testable (Design §4, Property 2 / Property 3).

What the built description includes:

- Incident type, priority, resolved zone name, resolved camera name, status,
  and creation time (Requirement 3.1).
- The numeric ``risk_score`` translated into a severity *word* — ``critical``
  (>= 0.85), ``high`` (>= 0.6), ``moderate`` (>= 0.35), else ``low``
  (Requirement 3.2).
- The ``created_at`` timestamp translated into a human time-of-day phrase plus
  the calendar date (Requirement 3.3).
- The assigned guard name, included **only** when a guard name was resolved
  (Requirement 3.4).

Because the resolver falls back to the raw UUID string when a name cannot be
resolved (Req 2.5), the resolved ``*_name`` fields are used verbatim here — the
builder never re-derives names and never aborts (Requirement 2.4).
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from models.internal import ResolvedIncident


# --- Severity translation (Requirement 3.2) --------------------------------------
#
# Thresholds are checked from highest to lowest. A score at or above a band's
# threshold takes that band's word; anything below the lowest threshold is
# "low". Scores are clamped implicitly by the comparison chain, so out-of-range
# values (e.g. negative or > 1.0) still resolve to a sensible band.

_SEVERITY_CRITICAL = 0.85
_SEVERITY_HIGH = 0.6
_SEVERITY_MODERATE = 0.35


def _severity_word(risk_score: float) -> str:
    """Translate a numeric ``risk_score`` into a severity word (Req 3.2)."""

    if risk_score >= _SEVERITY_CRITICAL:
        return "critical"
    if risk_score >= _SEVERITY_HIGH:
        return "high"
    if risk_score >= _SEVERITY_MODERATE:
        return "moderate"
    return "low"


# --- Time-of-day translation (Requirement 3.3) -----------------------------------
#
# The 24-hour clock is partitioned into contiguous, non-overlapping bands so
# that every hour 0-23 maps to exactly one phrase.

def _time_of_day_phrase(hour: int) -> str:
    """Translate an hour (0-23) into a human time-of-day phrase (Req 3.3)."""

    if 0 <= hour <= 4:
        return "late at night"
    if 5 <= hour <= 7:
        return "early in the morning"
    if 8 <= hour <= 11:
        return "in the morning"
    if 12 <= hour <= 16:
        return "in the afternoon"
    if 17 <= hour <= 20:
        return "in the evening"
    # 21-23
    return "at night"


def _render_created_at(created_at: Optional[datetime]) -> str:
    """Render the creation time as a time-of-day phrase plus a calendar date.

    Returns a phrase such as ``"in the afternoon on 2024-05-01 at 14:30"``.
    When no timestamp is available the creation time is reported as unknown so
    the description still lists a creation time (Requirement 3.1) without
    fabricating one.
    """

    if created_at is None:
        return "at an unknown time"

    phrase = _time_of_day_phrase(created_at.hour)
    calendar_date = created_at.strftime("%Y-%m-%d")
    clock = created_at.strftime("%H:%M")
    return f"{phrase} on {calendar_date} at {clock}"


def build_description(incident: ResolvedIncident) -> str:
    """Build the human-readable Incident_Description for ``incident`` (Req 3).

    Pure function: the output is fully determined by the fields of
    ``incident``; no I/O is performed. The resolved ``zone_name``,
    ``camera_name``, and ``assigned_guard_name`` are used verbatim, so when the
    resolver fell back to a UUID (Req 2.5) that UUID naturally appears in the
    description and processing still succeeds (Req 2.4, Property 3).

    Args:
        incident: The incident with UUIDs already resolved to human names
            (with UUID fallbacks).

    Returns:
        A single-sentence description containing the incident type, priority,
        severity word, resolved zone and camera names, status, creation time
        (time-of-day phrase plus calendar date), and — only when a guard name
        was resolved — the assigned guard name.
    """

    severity = _severity_word(incident.risk_score)
    when = _render_created_at(incident.created_at)

    # Core sentence: type + severity + priority + location + status + time.
    # Every field required by Req 3.1 is present; the severity word (Req 3.2)
    # and the time-of-day rendering (Req 3.3) are woven in.
    description = (
        f"A {severity} severity {incident.type} incident "
        f"(priority {incident.priority}) "
        f"in zone {incident.zone_name} on camera {incident.camera_name} "
        f"is currently {incident.status}. "
        f"It was reported {when}."
    )

    # Req 3.4: include the assigned guard only when a guard name was resolved.
    guard_name = incident.assigned_guard_name
    if guard_name is not None and str(guard_name).strip():
        description += f" It is assigned to guard {guard_name}."

    return description
