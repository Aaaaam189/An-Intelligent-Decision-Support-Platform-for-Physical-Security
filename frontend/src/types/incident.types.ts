export type IncidentType =
  | "WEAPON_DETECTED"
  | "INTRUSION"
  | "AFTER_HOURS_PRESENCE"
  | "UNAUTHORIZED_VEHICLE"
  | "CROWD_OVERFLOW"
  | "SUSPICIOUS_ACTIVITY"
  | "OTHER";

// Shared, ordered list of the Fixed_Incident_Type_Set. This is the single
// source of truth for populating the rule form's "Incident Type" dropdown so
// the options stay consistent with the IncidentType union everywhere.
export const INCIDENT_TYPE_OPTIONS: readonly IncidentType[] = [
  "WEAPON_DETECTED",
  "INTRUSION",
  "AFTER_HOURS_PRESENCE",
  "UNAUTHORIZED_VEHICLE",
  "CROWD_OVERFLOW",
  "SUSPICIOUS_ACTIVITY",
  "OTHER",
] as const;

export type IncidentPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type IncidentStatus = "PENDING" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export interface Incident {
  id: string;
  cameraId: string;
  zoneId: string;
  type: IncidentType;
  priority: IncidentPriority;
  riskScore: number;
  status: IncidentStatus;
  ruleId: string | null;
  shiftId: string | null;
  assignedGuardId: string | null;
  createdAt: string;
  closedAt: string | null;
  // Situation tracking. Optional so older payloads (and existing tests) that
  // predate it still type-check.
  contributingTypes?: string[];
  peakPersonCount?: number;
  peakVehicleCount?: number;
  weaponCount?: number;
  lastActivityAt?: string | null;
  escalatedAt?: string | null;
}

// One entry of an incident's timeline ("what happened").
export interface IncidentEvent {
  id: string;
  incidentId: string;
  kind: "PERSON_DETECTED" | "VEHICLE_DETECTED" | "WEAPON_DETECTED" | string;
  summary: string;
  reason: string;
  weaponClass: string | null;
  confidence: number | null;
  trackId: string | null;
  linkedTrackId: string | null;
  // File name of the evidence image; see snapshotUrl() in constants/stream.
  snapshot: string | null;
  ruleId: string | null;
  incidentType: string;
  priority: string;
  escalated: boolean;
  occurredAt: string;
}
