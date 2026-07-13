package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type RulePriority string

const (
	RulePriorityLow      RulePriority = "LOW"
	RulePriorityMedium   RulePriority = "MEDIUM"
	RulePriorityHigh     RulePriority = "HIGH"
	RulePriorityCritical RulePriority = "CRITICAL"
)

type Rule struct {
	ID                uuid.UUID    `gorm:"type:char(36);primaryKey" json:"id"`
	Name              string       `gorm:"size:150;not null" json:"name"`
	Condition         string       `gorm:"type:text;not null" json:"condition"`
	ResultingPriority RulePriority `gorm:"type:varchar(20);not null" json:"resultingPriority"`
	CreatedAt         time.Time    `json:"createdAt"`
}

func (r *Rule) BeforeCreate(tx *gorm.DB) error {
	if r.ID == uuid.Nil {
		r.ID = uuid.New()
	}
	return nil
}