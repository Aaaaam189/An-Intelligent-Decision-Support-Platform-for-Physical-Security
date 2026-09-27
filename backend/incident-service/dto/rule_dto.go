package dto

import (
	"time"

	"github.com/google/uuid"
	"sentinelai/incident-service/models"
)

// CreateRuleRequest is the payload an admin submits to create a detection rule.
//
// Validation is expressed with gin binding tags:
//   - detectionType, zoneScope, resultingPriority are constrained via oneof
//   - weaponClass is required when detectionType is WEAPON_DETECTED and, when
//     present, must be one of gun/rifle/knife/any
//   - windowStartMin/windowEndMin must be minutes-since-midnight in 0..1439
//
// The always-trigger flag is weapon-only in semantics; that cross-field rule is
// enforced at the service boundary (see Validate), not via a binding tag.
type CreateRuleRequest struct {
	Name              string               `json:"name" binding:"required"`
	DetectionType     models.DetectionType `json:"detectionType" binding:"required,oneof=PERSON_DETECTED WEAPON_DETECTED VEHICLE_DETECTED"`
	WeaponClass       *models.WeaponClass  `json:"weaponClass,omitempty" binding:"required_if=DetectionType WEAPON_DETECTED,omitempty,oneof=gun rifle knife any"`
	ZoneScope         models.ZoneScope     `json:"zoneScope" binding:"required,oneof=ALL SET"`
	TargetZones       []uuid.UUID          `json:"targetZones,omitempty"`
	WindowStartMin    int                  `json:"windowStartMin" binding:"min=0,max=1439"`
	WindowEndMin      int                  `json:"windowEndMin" binding:"min=0,max=1439"`
	AlwaysTrigger     bool                 `json:"alwaysTrigger"`
	ResultingPriority models.RulePriority  `json:"resultingPriority" binding:"required,oneof=LOW MEDIUM HIGH CRITICAL"`
	IncidentType      models.IncidentType  `json:"incidentType" binding:"required,oneof=WEAPON_DETECTED INTRUSION AFTER_HOURS_PRESENCE UNAUTHORIZED_VEHICLE CROWD_OVERFLOW SUSPICIOUS_ACTIVITY OTHER"`
}

// UpdateRuleRequest is a partial update: every field is optional and only the
// provided fields are applied. Provided values are still constrained by the
// same binding rules as on create.
type UpdateRuleRequest struct {
	Name              *string               `json:"name,omitempty" binding:"omitempty,min=1"`
	DetectionType     *models.DetectionType `json:"detectionType,omitempty" binding:"omitempty,oneof=PERSON_DETECTED WEAPON_DETECTED VEHICLE_DETECTED"`
	WeaponClass       *models.WeaponClass   `json:"weaponClass,omitempty" binding:"omitempty,oneof=gun rifle knife any"`
	ZoneScope         *models.ZoneScope     `json:"zoneScope,omitempty" binding:"omitempty,oneof=ALL SET"`
	TargetZones       []uuid.UUID           `json:"targetZones,omitempty"`
	WindowStartMin    *int                  `json:"windowStartMin,omitempty" binding:"omitempty,min=0,max=1439"`
	WindowEndMin      *int                  `json:"windowEndMin,omitempty" binding:"omitempty,min=0,max=1439"`
	AlwaysTrigger     *bool                 `json:"alwaysTrigger,omitempty"`
	ResultingPriority *models.RulePriority  `json:"resultingPriority,omitempty" binding:"omitempty,oneof=LOW MEDIUM HIGH CRITICAL"`
	IncidentType      *models.IncidentType  `json:"incidentType,omitempty" binding:"omitempty,oneof=WEAPON_DETECTED INTRUSION AFTER_HOURS_PRESENCE UNAUTHORIZED_VEHICLE CROWD_OVERFLOW SUSPICIOUS_ACTIVITY OTHER"`
}

// SetRuleEnabledRequest toggles a rule's enabled/disabled state.
type SetRuleEnabledRequest struct {
	Enabled *bool `json:"enabled" binding:"required"`
}

// RuleResponse is the API representation of a persisted rule, exposing its
// conditions, outcome, and enabled state.
type RuleResponse struct {
	ID                uuid.UUID            `json:"id"`
	Name              string               `json:"name"`
	Enabled           bool                 `json:"enabled"`
	DetectionType     models.DetectionType `json:"detectionType"`
	WeaponClass       *models.WeaponClass  `json:"weaponClass,omitempty"`
	ZoneScope         models.ZoneScope     `json:"zoneScope"`
	TargetZones       []uuid.UUID          `json:"targetZones"`
	WindowStartMin    int                  `json:"windowStartMin"`
	WindowEndMin      int                  `json:"windowEndMin"`
	AlwaysTrigger     bool                 `json:"alwaysTrigger"`
	ResultingPriority models.RulePriority  `json:"resultingPriority"`
	IncidentType      models.IncidentType  `json:"incidentType"`
	CreatedAt         time.Time            `json:"createdAt"`
	UpdatedAt         time.Time            `json:"updatedAt"`
}
