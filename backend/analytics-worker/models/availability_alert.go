package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// AvailabilityAlertStatus mirrors the lifecycle state owned by the
// incident-service. OPEN and ACKNOWLEDGED are non-terminal; RESOLVED is
// terminal. A resolved alert can never return to the acknowledged state
// (Requirement 6.6).
type AvailabilityAlertStatus string

const (
	AvailabilityAlertStatusOpen         AvailabilityAlertStatus = "OPEN"
	AvailabilityAlertStatusAcknowledged AvailabilityAlertStatus = "ACKNOWLEDGED"
	AvailabilityAlertStatusResolved     AvailabilityAlertStatus = "RESOLVED"
)

// AvailabilityAlert is the analytics-worker's persisted copy of a first-class
// availability alert. The incident-service remains the source of truth for the
// lifecycle; this copy is kept in sync by consuming the
// alert.availability_created, alert.availability_acknowledged, and
// alert.availability_resolved events (Requirement 7.4).
//
// It evolves the previous critical_alert concept by adding acknowledge/resolve
// fields and a forward-compatible ResponseActions extension point
// (Requirements 7.5, 7.6, 7.7, 8.1).
type AvailabilityAlert struct {
	ID                   uuid.UUID               `gorm:"type:char(36);primaryKey" json:"id"`
	TriggeringIncidentID uuid.UUID               `gorm:"type:char(36);index" json:"triggeringIncidentId"`
	ZoneID               *uuid.UUID              `gorm:"type:char(36);index" json:"zoneId,omitempty"`
	Priority             string                  `gorm:"type:varchar(20)" json:"priority,omitempty"`
	Message              string                  `gorm:"type:text" json:"message,omitempty"`
	Status               AvailabilityAlertStatus `gorm:"type:varchar(20);not null;default:OPEN;index" json:"status"`
	AcknowledgedBy       *uuid.UUID              `gorm:"type:char(36)" json:"acknowledgedBy,omitempty"`
	AcknowledgedAt       *time.Time              `json:"acknowledgedAt,omitempty"`
	ResolvedBy           *uuid.UUID              `gorm:"type:char(36)" json:"resolvedBy,omitempty"`
	ResolvedAt           *time.Time              `json:"resolvedAt,omitempty"`
	// ResponseActions is a nullable JSON extension point (Requirements 7.7,
	// 8.1) mirrored from the source-of-truth record. Stored as raw JSON text
	// to avoid a new dependency in this service.
	ResponseActions string    `gorm:"type:json" json:"responseActions,omitempty"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

func (a *AvailabilityAlert) BeforeCreate(tx *gorm.DB) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return nil
}
