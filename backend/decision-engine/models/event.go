package models

import "time"

// DetectionEvent is the shape the ai-service publishes to the
// sentinelai.events exchange.
//
// Weapon events carry cameraId, zoneId, type=WEAPON_DETECTED, weaponClass,
// confidence, timestamp and snapshotPath. Person/vehicle events carry
// cameraId, zoneId, type, currentCount and timestamp. Metadata is retained
// as a flexible bag for anything event-type specific and for forward
// compatibility.
type DetectionEvent struct {
	CameraID     string                 `json:"cameraId"`
	ZoneID       string                 `json:"zoneId"`
	Type         string                 `json:"type"` // PERSON_DETECTED, WEAPON_DETECTED, VEHICLE_DETECTED
	WeaponClass  string                 `json:"weaponClass,omitempty"`
	CurrentCount int                    `json:"currentCount,omitempty"`
	Timestamp    time.Time              `json:"timestamp"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
}

// ValidDetectionTypes is the closed set of detection types the
// decision-engine accepts. Any consumed event carrying a type outside this
// set is rejected as invalid.
var ValidDetectionTypes = map[string]struct{}{
	"PERSON_DETECTED":  {},
	"WEAPON_DETECTED":  {},
	"VEHICLE_DETECTED": {},
}

// Validate reports whether the detection event carries all required fields
// and a known type. It is a pure function with no side effects.
//
// A consumed event is invalid when it is missing any of the required fields
// cameraId, zoneId, type, or timestamp, or when it carries a type outside
// {PERSON_DETECTED, WEAPON_DETECTED, VEHICLE_DETECTED}. When invalid, the
// name of the first offending field ("cameraId", "zoneId", "type", or
// "timestamp") is returned so the caller can log the rejection with an
// indication of the invalid field (Requirement 3.11). A valid event returns
// ("", true).
func (e DetectionEvent) Validate() (offendingField string, valid bool) {
	if e.CameraID == "" {
		return "cameraId", false
	}
	if e.ZoneID == "" {
		return "zoneId", false
	}
	if e.Type == "" {
		return "type", false
	}
	if e.Timestamp.IsZero() {
		return "timestamp", false
	}
	if _, ok := ValidDetectionTypes[e.Type]; !ok {
		return "type", false
	}
	return "", true
}

// Rule mirrors the enabled-rule payload returned by the incident-service
// internal endpoint GET /internal/rules/enabled. Its JSON tags match the
// incident-service RuleResponse so the decision-engine can decode enabled
// rules directly and evaluate detection events against them.
type Rule struct {
	ID                string    `json:"id"`
	Name              string    `json:"name"`
	Enabled           bool      `json:"enabled"`
	DetectionType     string    `json:"detectionType"` // PERSON_DETECTED, WEAPON_DETECTED, VEHICLE_DETECTED
	WeaponClass       *string   `json:"weaponClass,omitempty"`
	ZoneScope         string    `json:"zoneScope"`   // ALL, SET
	TargetZones       []string  `json:"targetZones"` // zone ids when ZoneScope is SET
	WindowStartMin    int       `json:"windowStartMin"`
	WindowEndMin      int       `json:"windowEndMin"`
	AlwaysTrigger     bool      `json:"alwaysTrigger"`
	ResultingPriority string    `json:"resultingPriority"` // LOW, MEDIUM, HIGH, CRITICAL
	IncidentType      string    `json:"incidentType"`      // WEAPON_DETECTED, INTRUSION, AFTER_HOURS_PRESENCE, UNAUTHORIZED_VEHICLE, CROWD_OVERFLOW, SUSPICIOUS_ACTIVITY, OTHER
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}
