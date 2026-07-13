package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Shift struct {
	ID        uuid.UUID `gorm:"type:char(36);primaryKey" json:"id"`
	GuardID   uuid.UUID `gorm:"type:char(36);not null;index" json:"guardId"`
	ZoneID    uuid.UUID `gorm:"type:char(36);not null;index" json:"zoneId"`
	StartTime time.Time `gorm:"not null" json:"startTime"`
	EndTime   time.Time `gorm:"not null" json:"endTime"`
}

func (s *Shift) BeforeCreate(tx *gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return nil
}