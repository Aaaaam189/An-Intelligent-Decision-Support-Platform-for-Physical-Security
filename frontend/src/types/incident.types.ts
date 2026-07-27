export type IncidentType =
  | "UNAUTHORIZED_ACCESS"
  | "RESTRICTED_ZONE_BREACH"
  | "CROWD_OVERFLOW"
  | "MULTI_CAMERA_MATCH"
  | "SUSPICIOUS_ACTIVITY"
  | "OTHER";

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
}
