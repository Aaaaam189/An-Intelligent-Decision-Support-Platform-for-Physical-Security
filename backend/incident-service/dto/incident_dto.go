package dto

import (
	"time"

	"github.com/google/uuid"
	"sentinelai/incident-service/models"
)

// CreateIncidentRequest is what the decision-engine (or, for now, manual
// testing) sends to actually create an incident. ZoneID is required
// directly here — incident-service has no way to look up a camera's
// zone itself, since camera-service owns that data.
type CreateIncidentRequest struct {
	CameraID  uuid.UUID               `json:"cameraId" binding:"required"`
	ZoneID    uuid.UUID               `json:"zoneId" binding:"required"`
	Type      models.IncidentType     `json:"type" binding:"required"`
	Priority  models.IncidentPriority `json:"priority" binding:"required,oneof=LOW MEDIUM HIGH CRITICAL"`
	RiskScore float64                 `json:"riskScore" binding:"required"`
	RuleID    *uuid.UUID              `json:"ruleId,omitempty"`
}

type UpdateIncidentStatusRequest struct {
	Status models.IncidentStatus `json:"status" binding:"required,oneof=PENDING IN_PROGRESS RESOLVED CLOSED"`
}

type ReassignIncidentRequest struct {
	GuardID uuid.UUID `json:"guardId" binding:"required"`
}

type IncidentResponse struct {
	ID              uuid.UUID               `json:"id"`
	CameraID        uuid.UUID               `json:"cameraId"`
	ZoneID          uuid.UUID               `json:"zoneId"`
	Type            models.IncidentType     `json:"type"`
	Priority        models.IncidentPriority `json:"priority"`
	RiskScore       float64                 `json:"riskScore"`
	Status          models.IncidentStatus   `json:"status"`
	RuleID          *uuid.UUID              `json:"ruleId"`
	ShiftID         *uuid.UUID              `json:"shiftId"`
	AssignedGuardID *uuid.UUID              `json:"assignedGuardId"`
	CreatedAt       time.Time               `json:"createdAt"`
	ClosedAt        *time.Time              `json:"closedAt"`
}