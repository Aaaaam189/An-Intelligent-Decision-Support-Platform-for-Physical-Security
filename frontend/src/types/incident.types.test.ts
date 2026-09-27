import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { INCIDENT_TYPE_OPTIONS, type IncidentType } from "./incident.types";

// The Fixed_Incident_Type_Set as defined in the requirements glossary.
const FIXED_INCIDENT_TYPE_SET: IncidentType[] = [
  "WEAPON_DETECTED",
  "INTRUSION",
  "AFTER_HOURS_PRESENCE",
  "UNAUTHORIZED_VEHICLE",
  "CROWD_OVERFLOW",
  "SUSPICIOUS_ACTIVITY",
  "OTHER",
];

describe("INCIDENT_TYPE_OPTIONS (dropdown source)", () => {
  it("equals the Fixed_Incident_Type_Set exactly, in order", () => {
    // Requirement 6.1: the incident type set matches the fixed set exactly.
    expect([...INCIDENT_TYPE_OPTIONS]).toEqual(FIXED_INCIDENT_TYPE_SET);
  });

  it("has no extra or missing members (order-independent)", () => {
    expect([...INCIDENT_TYPE_OPTIONS].sort()).toEqual(
      [...FIXED_INCIDENT_TYPE_SET].sort(),
    );
  });

  it("contains no duplicate values", () => {
    expect(new Set(INCIDENT_TYPE_OPTIONS).size).toBe(
      INCIDENT_TYPE_OPTIONS.length,
    );
  });

  it("every member of the fixed set is a selectable option and nothing else is", () => {
    // Property check: membership in INCIDENT_TYPE_OPTIONS is equivalent to
    // membership in the Fixed_Incident_Type_Set for any candidate string.
    const optionSet = new Set<string>(INCIDENT_TYPE_OPTIONS);
    const fixedSet = new Set<string>(FIXED_INCIDENT_TYPE_SET);

    fc.assert(
      fc.property(
        fc.oneof(
          fc.constantFrom(...FIXED_INCIDENT_TYPE_SET),
          fc.string(),
        ),
        (candidate) => {
          expect(optionSet.has(candidate)).toBe(fixedSet.has(candidate));
        },
      ),
      { numRuns: 100 },
    );
  });
});
