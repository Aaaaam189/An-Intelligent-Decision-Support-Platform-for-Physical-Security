package db

import (
	"testing"

	"pgregory.net/rapid"

	"sentinelai/incident-service/models"
)

// fixedIncidentTypeSet is the closed set of incident types available for
// selection and storage (the Fixed_Incident_Type_Set from the spec).
var fixedIncidentTypeSet = map[models.IncidentType]struct{}{
	models.TypeWeaponDetected:      {},
	models.TypeIntrusion:           {},
	models.TypeAfterHoursPresence:  {},
	models.TypeUnauthorizedVehicle: {},
	models.TypeCrowdOverflow:       {},
	models.TypeSuspiciousActivity:  {},
	models.TypeOther:               {},
}

// validDetectionTypes are the detection types a pre-existing rule may carry.
var validDetectionTypes = []models.DetectionType{
	models.DetectionTypeWeapon,
	models.DetectionTypePerson,
	models.DetectionTypeVehicle,
}

// expectedBackfill is the Detection_Type_Backfill_Map, expressed
// independently of the implementation under test.
var expectedBackfill = map[models.DetectionType]models.IncidentType{
	models.DetectionTypeWeapon:  models.TypeWeaponDetected,
	models.DetectionTypePerson:  models.TypeIntrusion,
	models.DetectionTypeVehicle: models.TypeUnauthorizedVehicle,
}

// TestProperty6_BackfillMapsEachDetectionType verifies that the backfill maps
// each of the three detection types to its designated incident type.
//
// Feature: rule-incident-type, Property 6: Backfill maps each detection type
// to its designated incident type. For any pre-existing rule with an unset
// incidentType, the backfill assigns WEAPON_DETECTED when the rule's
// Detection_Type is WEAPON_DETECTED, INTRUSION when it is PERSON_DETECTED, and
// UNAUTHORIZED_VEHICLE when it is VEHICLE_DETECTED.
//
// Validates: Requirements 3.1, 3.2, 3.3
func TestProperty6_BackfillMapsEachDetectionType(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		detectionType := rapid.SampledFrom(validDetectionTypes).Draw(t, "detectionType")

		got := BackfillIncidentTypeFor(detectionType)
		want := expectedBackfill[detectionType]

		if got != want {
			t.Fatalf("BackfillIncidentTypeFor(%q) = %q, want %q", detectionType, got, want)
		}
	})
}

// TestProperty7_BackfillLeavesValidIncidentType verifies that after applying
// the backfill mapping to any population of rules with valid detection types
// and unset incident type, every rule ends up with a non-empty incident type
// that is a member of the Fixed_Incident_Type_Set.
//
// Feature: rule-incident-type, Property 7: Backfill leaves every rule with a
// valid incident type. For any population of pre-existing rules with valid
// detection types, after the backfill completes every rule has a non-empty
// incidentType that is a member of the Fixed_Incident_Type_Set.
//
// Validates: Requirement 3.4
func TestProperty7_BackfillLeavesValidIncidentType(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// A population of rules, each with a valid detection type and an
		// unset (empty) incident type, as would exist before the backfill.
		population := rapid.SliceOf(
			rapid.SampledFrom(validDetectionTypes),
		).Draw(t, "population")

		for i, detectionType := range population {
			assigned := BackfillIncidentTypeFor(detectionType)

			if assigned == "" {
				t.Fatalf("rule %d (detectionType %q): backfill assigned empty incident type", i, detectionType)
			}

			if _, ok := fixedIncidentTypeSet[assigned]; !ok {
				t.Fatalf("rule %d (detectionType %q): backfill assigned %q which is not a member of the Fixed_Incident_Type_Set", i, detectionType, assigned)
			}
		}
	})
}
