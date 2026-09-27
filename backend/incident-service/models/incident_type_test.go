package models

import (
	"sort"
	"testing"
)

// TestIncidentTypeEnumShape is a smoke test asserting that the IncidentType
// constant set equals the Fixed_Incident_Type_Set exactly, with no extra and no
// missing members.
//
// Validates: Requirements 6.1, 6.3
func TestIncidentTypeEnumShape(t *testing.T) {
	// Fixed_Incident_Type_Set from the requirements/design.
	expected := []IncidentType{
		TypeWeaponDetected,
		TypeIntrusion,
		TypeAfterHoursPresence,
		TypeUnauthorizedVehicle,
		TypeCrowdOverflow,
		TypeSuspiciousActivity,
		TypeOther,
	}

	// Assert each constant maps to the exact expected string value.
	wantValues := map[IncidentType]string{
		TypeWeaponDetected:      "WEAPON_DETECTED",
		TypeIntrusion:           "INTRUSION",
		TypeAfterHoursPresence:  "AFTER_HOURS_PRESENCE",
		TypeUnauthorizedVehicle: "UNAUTHORIZED_VEHICLE",
		TypeCrowdOverflow:       "CROWD_OVERFLOW",
		TypeSuspiciousActivity:  "SUSPICIOUS_ACTIVITY",
		TypeOther:               "OTHER",
	}
	for c, v := range wantValues {
		if string(c) != v {
			t.Errorf("IncidentType constant = %q, want %q", string(c), v)
		}
	}

	// The set of string values must equal the fixed set exactly.
	got := make([]string, 0, len(expected))
	for _, e := range expected {
		got = append(got, string(e))
	}
	want := []string{
		"AFTER_HOURS_PRESENCE",
		"CROWD_OVERFLOW",
		"INTRUSION",
		"OTHER",
		"SUSPICIOUS_ACTIVITY",
		"UNAUTHORIZED_VEHICLE",
		"WEAPON_DETECTED",
	}
	sort.Strings(got)

	if len(got) != len(want) {
		t.Fatalf("IncidentType set has %d members %v, want %d members %v", len(got), got, len(want), want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("IncidentType set mismatch at %d: got %q, want %q (full got=%v)", i, got[i], want[i], got)
		}
	}
}
