package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

// AvailabilityAlertStatus is the lifecycle state of an availability alert.
// OPEN and ACKNOWLEDGED are non-terminal; RESOLVED is terminal. A resolved
// alert can never return to the acknowledged state (Requirement 6.6).
type AvailabilityAlertStatus string

const (
	AvailabilityAlertStatusOpen         AvailabilityAlertStatus = "OPEN"
	AvailabilityAlertStatusAcknowledged AvailabilityAlertStatus = "ACKNOWLEDGED"
	AvailabilityAlertStatusResolved     AvailabilityAlertStatus = "RESOLVED"
)

// AvailabilityAlert is a first-class escalation record (distinct from an
// Incident) fired when a critical or high incident cannot be covered because
// every on-duty guard is already occupied. It is acknowledgeable and
// resolvable, and carries a forward-compatible extension point
// (ResponseActions) for future post-alert response actions
// (Requirements 7.1, 7.7, 8.1).
type AvailabilityAlert struct {
	ID                   uuid.UUID               `gorm:"type:char(36);primaryKey" json:"id"`
	TriggeringIncidentID uuid.UUID               `gorm:"type:char(36);not null;index" json:"triggeringIncidentId"`
	Status               AvailabilityAlertStatus `gorm:"type:varchar(20);not null;default:OPEN" json:"status"`
	AcknowledgedBy       *uuid.UUID              `gorm:"type:char(36)" json:"acknowledgedBy,omitempty"`
	AcknowledgedAt       *time.Time              `json:"acknowledgedAt,omitempty"`
	ResolvedBy           *uuid.UUID              `gorm:"type:char(36)" json:"resolvedBy,omitempty"`
	ResolvedAt           *time.Time              `json:"resolvedAt,omitempty"`
	// ResponseActions is a nullable JSON extension point (Requirements 7.7,
	// 8.1) so future post-alert response actions can attach without altering
	// the existing record structure.
	ResponseActions datatypes.JSON `gorm:"type:json" json:"responseActions,omitempty"`
	CreatedAt       time.Time      `json:"createdAt"`
	UpdatedAt       time.Time      `json:"updatedAt"`
}

func (a *AvailabilityAlert) BeforeCreate(tx *gorm.DB) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return nil
}
