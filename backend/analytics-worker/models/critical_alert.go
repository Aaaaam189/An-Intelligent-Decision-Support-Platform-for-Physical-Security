package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type CriticalAlert struct {
	ID         uuid.UUID `gorm:"type:char(36);primaryKey" json:"id"`
	IncidentID uuid.UUID `gorm:"type:char(36);index" json:"incidentId"`
	ZoneID     uuid.UUID `gorm:"type:char(36);index" json:"zoneId"`
	Priority   string    `gorm:"type:varchar(20)" json:"priority"`
	Message    string    `gorm:"type:text" json:"message"`
	CreatedAt  time.Time `json:"createdAt"`
}

func (a *CriticalAlert) BeforeCreate(tx *gorm.DB) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return nil
}