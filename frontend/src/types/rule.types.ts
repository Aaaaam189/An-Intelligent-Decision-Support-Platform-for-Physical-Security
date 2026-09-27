import type { IncidentType } from "./incident.types";

export type RulePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// What the rule matches against. Mirrors the backend DetectionType.
export type DetectionType =
  | "PERSON_DETECTED"
  | "WEAPON_DETECTED"
  | "VEHICLE_DETECTED";

// Weapon sub-classification. Only meaningful when detectionType is
// WEAPON_DETECTED.
export type WeaponClass = "gun" | "rifle" | "knife" | "any";

// Whether the rule applies to every zone or a specific set of zones.
export type ZoneScope = "ALL" | "SET";

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  detectionType: DetectionType;
  weaponClass?: WeaponClass | null;
  zoneScope: ZoneScope;
  targetZones: string[];
  // Active time window expressed as minutes since midnight (0..1439).
  windowStartMin: number;
  windowEndMin: number;
  // When true the rule fires regardless of the time window (weapon-only).
  alwaysTrigger: boolean;
  resultingPriority: RulePriority;
  incidentType: IncidentType;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRuleRequest {
  name: string;
  detectionType: DetectionType;
  weaponClass?: WeaponClass;
  zoneScope: ZoneScope;
  targetZones?: string[];
  windowStartMin: number;
  windowEndMin: number;
  alwaysTrigger: boolean;
  resultingPriority: RulePriority;
  incidentType: IncidentType;
}

export interface UpdateRuleRequest {
  name?: string;
  detectionType?: DetectionType;
  weaponClass?: WeaponClass;
  zoneScope?: ZoneScope;
  targetZones?: string[];
  windowStartMin?: number;
  windowEndMin?: number;
  alwaysTrigger?: boolean;
  resultingPriority?: RulePriority;
  incidentType?: IncidentType;
}
