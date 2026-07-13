package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)


type Camera struct {
	ID        uuid.UUID `gorm:"type:char(36);primaryKey" json:"id"`
	Name      string    `gorm:"size:150;not null" json:"name"`
	ZoneID    uuid.UUID `gorm:"type:char(36);index" json:"zoneId"`
	Location  string    `gorm:"size:150;not null" json:"location"`
	IsActive  bool      `gorm:"not null" json:"isActive"`
	StreamURL string    `gorm:"size:255;not null" json:"streamUrl"`
	CreatedAt time.Time `json:"createdAt"`

}


func (c *Camera) BeforeCreate(tx *gorm.DB) error {
	if c.ID == uuid.Nil {
		c.ID = uuid.New()
	}
	return nil
}
