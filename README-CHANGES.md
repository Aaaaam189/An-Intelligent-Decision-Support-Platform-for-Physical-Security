# Incident situations: what changed

Unzip over the repo root (paths match the repo). Nothing here has been built or
run yet; see the checklist in the chat message.

New:      backend/incident-service/{models/incident_event.go, dto/ingest_dto.go, services/situation_service.go}
          ai-service/{vehicle_link.py, test_vehicle_link.py}
          frontend/src/{hooks/useIncidentEvents.ts, components/incidents/*}
Changed:  see the file list (everything else in this folder).
Unused:   backend/decision-engine/cooldown/ is no longer called (left in place).
New env:  INCIDENT_GRACE_SECONDS (incident-service, default 120), HEARTBEAT_SECONDS (ai-service, default 10)

## Presence levels instead of head counts
The AI no longer reports exact numbers of people/vehicles (tracker ids are not people, so counts drifted). It reports a LEVEL: one or several. Incidents say "Person detected" / "People detected", "Vehicle detected" / "Vehicles detected", "Weapon detected". Links are kept: weapon near person #N, person appeared next to vehicle #N. `peak_person_count` / `peak_vehicle_count` columns now hold the level (0 none, 1 one, 2 several).
