package dto

import (
	"time"

	"github.com/google/uuid"
	"sentinelai/incident-service/models"
)

type CreateRuleRequest struct {
	Name              string               `json:"name" binding:"required"`
	Condition         string               `json:"condition" binding:"required"`
	ResultingPriority models.RulePriority  `json:"resultingPriority" binding:"required,oneof=LOW MEDIUM HIGH CRITICAL"`
}

type UpdateRuleRequest struct {
	Name              *string              `json:"name,omitempty"`
	Condition         *string              `json:"condition,omitempty"`
	ResultingPriority *models.RulePriority `json:"resultingPriority,omitempty"`
}

type RuleResponse struct {
	ID                uuid.UUID           `json:"id"`
	Name              string              `json:"name"`
	Condition         string              `json:"condition"`
	ResultingPriority models.RulePriority `json:"resultingPriority"`
	CreatedAt         time.Time           `json:"createdAt"`
}