package models

import (
	"time"

	"github.com/google/uuid"
)

// IncidentStat holds the current state of one incident, upserted every
// time an event arrives for it — this table always reflects "latest
// known state," not a history log.
type IncidentStat struct {
	IncidentID      uuid.UUID  `gorm:"type:char(36);primaryKey" json:"incidentId"`
	ZoneID          uuid.UUID  `gorm:"type:char(36);index" json:"zoneId"`
	Priority        string     `gorm:"type:varchar(20);index" json:"priority"`
	Status          string     `gorm:"type:varchar(20);index" json:"status"`
	AssignedGuardID *uuid.UUID `gorm:"type:char(36)" json:"assignedGuardId"`
	IncidentCreatedAt time.Time `json:"incidentCreatedAt"`
	ClosedAt        *time.Time `json:"closedAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}