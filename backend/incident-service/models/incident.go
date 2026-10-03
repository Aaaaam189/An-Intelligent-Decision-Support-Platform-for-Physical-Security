package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type IncidentType string

const (
	TypeWeaponDetected      IncidentType = "WEAPON_DETECTED"
	TypeIntrusion           IncidentType = "INTRUSION"
	TypeAfterHoursPresence  IncidentType = "AFTER_HOURS_PRESENCE"
	TypeUnauthorizedVehicle IncidentType = "UNAUTHORIZED_VEHICLE"
	TypeCrowdOverflow       IncidentType = "CROWD_OVERFLOW"
	TypeSuspiciousActivity  IncidentType = "SUSPICIOUS_ACTIVITY"
	TypeOther               IncidentType = "OTHER"
)

type IncidentPriority string

const (
	PriorityLow      IncidentPriority = "LOW"
	PriorityMedium   IncidentPriority = "MEDIUM"
	PriorityHigh     IncidentPriority = "HIGH"
	PriorityCritical IncidentPriority = "CRITICAL"
)

type IncidentStatus string

const (
	StatusPending    IncidentStatus = "PENDING"
	StatusInProgress IncidentStatus = "IN_PROGRESS"
	StatusResolved   IncidentStatus = "RESOLVED"
	StatusClosed     IncidentStatus = "CLOSED"
)

type Incident struct {
	ID              uuid.UUID        `gorm:"type:char(36);primaryKey" json:"id"`
	CameraID        uuid.UUID        `gorm:"type:char(36);not null;index" json:"cameraId"`
	ZoneID          uuid.UUID        `gorm:"type:char(36);not null;index" json:"zoneId"`
	Type            IncidentType     `gorm:"type:varchar(30);not null" json:"type"`
	Priority        IncidentPriority `gorm:"type:varchar(20);not null" json:"priority"`
	RiskScore       float64          `gorm:"not null" json:"riskScore"`
	Status          IncidentStatus   `gorm:"type:varchar(20);not null;default:PENDING" json:"status"`
	RuleID          *uuid.UUID       `gorm:"type:char(36);index" json:"ruleId"`
	ShiftID         *uuid.UUID       `gorm:"type:char(36);index" json:"shiftId"`
	AssignedGuardID *uuid.UUID       `gorm:"type:char(36);index" json:"assignedGuardId"`
	CreatedAt       time.Time        `json:"createdAt"`
	ClosedAt        *time.Time       `json:"closedAt"`

	// --- Situation tracking -------------------------------------------------
	// An incident represents one ongoing security SITUATION (for example a
	// vehicle arriving, a person stepping out of it, then a weapon appearing),
	// not a single detection. These fields describe how that situation evolved.

	// ContributingTypes lists every incident type the situation has carried,
	// in the order it picked them up. Type/Priority always reflect the most
	// serious one; this keeps the history (e.g. INTRUSION then WEAPON_DETECTED).
	ContributingTypes []string `gorm:"serializer:json;type:text" json:"contributingTypes"`
	// PeakPersonCount / PeakVehicleCount are presence LEVELS, not head counts:
	// 0 none, 1 one, 2 several. They only ever go up. (The names predate this.)
	PeakPersonCount  int `gorm:"not null;default:0" json:"peakPersonCount"`
	PeakVehicleCount int `gorm:"not null;default:0" json:"peakVehicleCount"`
	WeaponCount      int `gorm:"not null;default:0" json:"weaponCount"`
	// LastActivityAt is bumped by every event (including ai-service heartbeats)
	// and drives the grace period: a situation stays open while activity keeps
	// arriving and ends INCIDENT_GRACE_SECONDS after the last one.
	LastActivityAt *time.Time `gorm:"index" json:"lastActivityAt"`
	// EscalatedAt is set when a later event raised the incident's priority or
	// upgraded its type.
	EscalatedAt *time.Time `json:"escalatedAt"`
}

func (i *Incident) BeforeCreate(tx *gorm.DB) error {
	if i.ID == uuid.Nil {
		i.ID = uuid.New()
	}
	return nil
}
