package models

import(
	"time"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Zone struct{
	ID   uuid.UUID `gorm:"type:char(36);primaryKey" json:"id"`
	name string    `gorm:size:150;not null" json:"id"`
}

func (c *Zone) BeforeCreate(tx *gorm.DB) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	return nil
}