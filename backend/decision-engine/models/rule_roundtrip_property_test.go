package models

import (
	"encoding/json"
	"testing"
	"time"

	"pgregory.net/rapid"
)

// incidentServiceRuleResponse mirrors the incident-service dto.RuleResponse
// JSON shape (the enabled-rules payload produced by
// GET /internal/rules/enabled). Only the JSON tags matter for the
// service-boundary round trip: the decision-engine Rule mirror must decode the
// incidentType value from this payload without transformation.
type incidentServiceRuleResponse struct {
	ID                string     `json:"id"`
	Name              string     `json:"name"`
	Enabled           bool       `json:"enabled"`
	DetectionType     string     `json:"detectionType"`
	WeaponClass       *string    `json:"weaponClass,omitempty"`
	ZoneScope         string     `json:"zoneScope"`
	TargetZones       []string   `json:"targetZones"`
	WindowStartMin    int        `json:"windowStartMin"`
	WindowEndMin      int        `json:"windowEndMin"`
	AlwaysTrigger     bool       `json:"alwaysTrigger"`
	ResultingPriority string     `json:"resultingPriority"`
	IncidentType      string     `json:"incidentType"`
	CreatedAt         time.Time  `json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`
}

// fixedIncidentTypeSet is the closed set of incident types (Fixed_Incident_Type_Set).
var fixedIncidentTypeSet = []string{
	"WEAPON_DETECTED",
	"INTRUSION",
	"AFTER_HOURS_PRESENCE",
	"UNAUTHORIZED_VEHICLE",
	"CROWD_OVERFLOW",
	"SUSPICIOUS_ACTIVITY",
	"OTHER",
}

// Feature: rule-incident-type, Property 14: Incident type survives the
// service-boundary round trip. For any rule, encoding it as the incident-service
// enabled-rules response JSON and then decoding it into the decision-engine Rule
// mirror struct yields an IncidentType equal to the original, with no
// transformation.
//
// **Validates: Requirements 5.2, 5.3**
func TestProperty14_IncidentTypeSurvivesServiceBoundaryRoundTrip(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		incidentType := rapid.SampledFrom(fixedIncidentTypeSet).Draw(t, "incidentType")

		detectionType := rapid.SampledFrom([]string{
			"PERSON_DETECTED", "WEAPON_DETECTED", "VEHICLE_DETECTED",
		}).Draw(t, "detectionType")
		zoneScope := rapid.SampledFrom([]string{"ALL", "SET"}).Draw(t, "zoneScope")
		priority := rapid.SampledFrom([]string{"LOW", "MEDIUM", "HIGH", "CRITICAL"}).Draw(t, "priority")

		src := incidentServiceRuleResponse{
			ID:                rapid.StringN(0, 40, 40).Draw(t, "id"),
			Name:              rapid.StringN(0, 40, 40).Draw(t, "name"),
			Enabled:           rapid.Bool().Draw(t, "enabled"),
			DetectionType:     detectionType,
			ZoneScope:         zoneScope,
			TargetZones:       rapid.SliceOfN(rapid.StringN(0, 20, 20), 0, 5).Draw(t, "targetZones"),
			WindowStartMin:    rapid.IntRange(0, 1439).Draw(t, "windowStartMin"),
			WindowEndMin:      rapid.IntRange(0, 1439).Draw(t, "windowEndMin"),
			AlwaysTrigger:     rapid.Bool().Draw(t, "alwaysTrigger"),
			ResultingPriority: priority,
			IncidentType:      incidentType,
		}

		// Encode as the incident-service enabled-rules response JSON.
		payload, err := json.Marshal(src)
		if err != nil {
			t.Fatalf("failed to encode enabled-rules response: %v", err)
		}

		// Decode into the decision-engine Rule mirror struct.
		var mirror Rule
		if err := json.Unmarshal(payload, &mirror); err != nil {
			t.Fatalf("failed to decode into Rule mirror: %v", err)
		}

		// IncidentType must survive with no transformation.
		if mirror.IncidentType != src.IncidentType {
			t.Fatalf("incidentType changed across service boundary: got %q, want %q",
				mirror.IncidentType, src.IncidentType)
		}
	})
}
