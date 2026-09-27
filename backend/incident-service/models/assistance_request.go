package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// AssistanceRequest records a request for help raised by the assigned guard
// on an incident. It captures the requesting guard and a creation timestamp
// (Requirement 6.1).
type AssistanceRequest struct {
	ID                uuid.UUID `gorm:"type:char(36);primaryKey" json:"id"`
	IncidentID        uuid.UUID `gorm:"type:char(36);not null;index" json:"incidentId"`
	RequestingGuardID uuid.UUID `gorm:"type:char(36);not null;index" json:"requestingGuardId"`
	CreatedAt         time.Time `json:"createdAt"`
}

func (a *AssistanceRequest) BeforeCreate(tx *gorm.DB) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return nil
}
