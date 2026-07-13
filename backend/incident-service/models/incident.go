package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type IncidentType string

const (
	TypeUnauthorizedAccess  IncidentType = "UNAUTHORIZED_ACCESS"
	TypeRestrictedZoneBreach IncidentType = "RESTRICTED_ZONE_BREACH"
	TypeCrowdOverflow       IncidentType = "CROWD_OVERFLOW"
	TypeMultiCameraMatch    IncidentType = "MULTI_CAMERA_MATCH"
	TypeSuspiciousActivity  IncidentType = "SUSPICIOUS_ACTIVITY"
	TypeOther               IncidentType = "OTHER"
)

type IncidentPriority string

const (
	PriorityLow      IncidentPriority = "LOW"
	PriorityMedium   IncidentPriority = "MEDIUM"
	PriorityHigh     IncidentPriority = "HIGH"
	PriorityCritical IncidentPriority = "CRITICAL"
)

type IncidentStatus string

const (
	StatusPending    IncidentStatus = "PENDING"
	StatusInProgress IncidentStatus = "IN_PROGRESS"
	StatusResolved   IncidentStatus = "RESOLVED"
	StatusClosed     IncidentStatus = "CLOSED"
)

type Incident struct {
	ID              uuid.UUID        `gorm:"type:char(36);primaryKey" json:"id"`
	CameraID        uuid.UUID        `gorm:"type:char(36);not null;index" json:"cameraId"`
	ZoneID          uuid.UUID        `gorm:"type:char(36);not null;index" json:"zoneId"`
	Type            IncidentType     `gorm:"type:varchar(30);not null" json:"type"`
	Priority        IncidentPriority `gorm:"type:varchar(20);not null" json:"priority"`
	RiskScore       float64          `gorm:"not null" json:"riskScore"`
	Status          IncidentStatus   `gorm:"type:varchar(20);not null;default:PENDING" json:"status"`
	RuleID          *uuid.UUID       `gorm:"type:char(36);index" json:"ruleId"`
	ShiftID         *uuid.UUID       `gorm:"type:char(36);index" json:"shiftId"`
	AssignedGuardID *uuid.UUID       `gorm:"type:char(36);index" json:"assignedGuardId"`
	CreatedAt       time.Time        `json:"createdAt"`
	ClosedAt        *time.Time       `json:"closedAt"`
}

func (i *Incident) BeforeCreate(tx *gorm.DB) error {
	if i.ID == uuid.Nil {
		i.ID = uuid.New()
	}
	return nil
}