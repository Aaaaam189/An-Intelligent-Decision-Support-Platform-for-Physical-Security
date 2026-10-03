package dto

import (
	"time"

	"github.com/google/uuid"
	"sentinelai/incident-service/models"
)

// IngestEventRequest is what decision-engine sends for every detection event
// that matched an enabled rule. incident-service decides whether it opens a new
// incident or updates the situation that is already open for the camera+zone.
type IngestEventRequest struct {
	CameraID uuid.UUID `json:"cameraId" binding:"required"`
	ZoneID   uuid.UUID `json:"zoneId" binding:"required"`

	// DetectionType is the raw detection that fired.
	DetectionType string `json:"detectionType" binding:"required,oneof=PERSON_DETECTED WEAPON_DETECTED VEHICLE_DETECTED"`

	// IncidentType, Priority, RiskScore and RuleID are the outcome of the
	// winning rule for THIS event.
	IncidentType models.IncidentType     `json:"incidentType" binding:"required"`
	Priority     models.IncidentPriority `json:"priority" binding:"required,oneof=LOW MEDIUM HIGH CRITICAL"`
	RiskScore    float64                 `json:"riskScore"`
	RuleID       *uuid.UUID              `json:"ruleId,omitempty"`

	Timestamp *time.Time `json:"timestamp,omitempty"`
	// CurrentCount is a presence LEVEL, not a head count: 0 none, 1 one, 2 several.
	CurrentCount int `json:"currentCount"`

	WeaponClass *string  `json:"weaponClass,omitempty"`
	Confidence  *float64 `json:"confidence,omitempty"`
	TrackID     *string  `json:"trackId,omitempty"`
	// LinkedTrackID: "vehicle-4" when a person appeared next to that vehicle,
	// "person-12" when a weapon was found on that person.
	LinkedTrackID *string `json:"linkedTrackId,omitempty"`
	// Snapshot is a file name or path of the evidence image.
	Snapshot *string `json:"snapshot,omitempty"`

	// Heartbeat marks a periodic "situation is still going" update from
	// ai-service. Heartbeats keep an open incident alive and can raise counts,
	// but they never open a new incident.
	Heartbeat bool `json:"heartbeat"`
}

const (
	IngestActionCreated = "CREATED"
	IngestActionUpdated = "UPDATED"
	IngestActionIgnored = "IGNORED"
)

type IngestEventResponse struct {
	Action    string            `json:"action"`
	Escalated bool              `json:"escalated"`
	Incident  *IncidentResponse `json:"incident,omitempty"`
}

type IncidentEventResponse struct {
	ID            uuid.UUID  `json:"id"`
	IncidentID    uuid.UUID  `json:"incidentId"`
	Kind          string     `json:"kind"`
	Summary       string     `json:"summary"`
	Reason        string     `json:"reason"`
	WeaponClass   *string    `json:"weaponClass"`
	Confidence    *float64   `json:"confidence"`
	TrackID       *string    `json:"trackId"`
	LinkedTrackID *string    `json:"linkedTrackId"`
	Snapshot      *string    `json:"snapshot"`
	RuleID        *uuid.UUID `json:"ruleId"`
	IncidentType  string     `json:"incidentType"`
	Priority      string     `json:"priority"`
	Escalated     bool       `json:"escalated"`
	OccurredAt    time.Time  `json:"occurredAt"`
}
