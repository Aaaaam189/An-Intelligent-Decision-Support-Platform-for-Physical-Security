package models

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Zone struct {
	ID   uuid.UUID `gorm:"type:char(36);primaryKey" json:"id"`
	Name string    `gorm:"size:150;not null" json:"name"`
}

func (z *Zone) BeforeCreate(tx *gorm.DB) error {
	if z.ID == uuid.Nil {
		z.ID = uuid.New()
	}
	return nil
}