package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// IncidentEvent is one entry in an incident's timeline: something that
// happened during the security situation (a vehicle arrived, a person stepped
// out of it, a weapon appeared, the situation escalated...).
//
// Heartbeats that change nothing are NOT stored; only entries a guard would
// want to read are, so the timeline stays short and meaningful.
type IncidentEvent struct {
	ID         uuid.UUID `gorm:"type:char(36);primaryKey" json:"id"`
	IncidentID uuid.UUID `gorm:"type:char(36);not null;index" json:"incidentId"`

	// Kind is the detection type that produced the entry:
	// PERSON_DETECTED, VEHICLE_DETECTED or WEAPON_DETECTED.
	Kind string `gorm:"type:varchar(30);not null" json:"kind"`
	// Summary is the human-readable line shown in the timeline.
	Summary string `gorm:"type:varchar(255);not null" json:"summary"`
	// Reason explains the decision: which rule outcome applied and whether the
	// incident was opened or escalated because of this entry.
	Reason string `gorm:"type:varchar(500)" json:"reason"`

	WeaponClass *string  `gorm:"type:varchar(20)" json:"weaponClass"`
	Confidence  *float64 `json:"confidence"`
	// TrackID identifies the tracked object ("person-12", "weapon-3").
	TrackID *string `gorm:"type:varchar(40)" json:"trackId"`
	// LinkedTrackID points at a related object ("vehicle-4" for a person who
	// appeared next to that vehicle, "person-12" for the person holding a weapon).
	LinkedTrackID *string `gorm:"type:varchar(40)" json:"linkedTrackId"`
	// Snapshot is the file name of the evidence image served by ai-service at
	// /snapshots/<name>.
	Snapshot *string `gorm:"type:varchar(255)" json:"snapshot"`

	RuleID *uuid.UUID `gorm:"type:char(36)" json:"ruleId"`
	// IncidentType and Priority are the outcome of the rule that matched this
	// entry (not necessarily the incident's current headline values).
	IncidentType string `gorm:"type:varchar(30)" json:"incidentType"`
	Priority     string `gorm:"type:varchar(20)" json:"priority"`
	// Escalated is true when this entry raised the incident's priority or type.
	Escalated bool `gorm:"not null;default:false" json:"escalated"`

	OccurredAt time.Time `gorm:"not null;index" json:"occurredAt"`
}

func (e *IncidentEvent) BeforeCreate(tx *gorm.DB) error {
	if e.ID == uuid.Nil {
		e.ID = uuid.New()
	}
	return nil
}
