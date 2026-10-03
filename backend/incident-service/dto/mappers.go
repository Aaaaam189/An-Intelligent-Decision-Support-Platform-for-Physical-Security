package dto

import (
	"errors"

	"github.com/google/uuid"
	"sentinelai/incident-service/models"
)

// ErrWeaponClassRequired is returned when a WEAPON_DETECTED rule is submitted
// without a weapon-class filter.
var ErrWeaponClassRequired = errors.New("weaponClass is required when detectionType is WEAPON_DETECTED")

// ErrWeaponClassNotAllowed is returned when a non-weapon rule carries a
// weapon-class filter.
var ErrWeaponClassNotAllowed = errors.New("weaponClass is only valid when detectionType is WEAPON_DETECTED")

// ErrAlwaysTriggerNotAllowed is returned when a non-weapon rule sets the
// always-trigger flag (the flag is weapon-only per Requirement 2.8).
var ErrAlwaysTriggerNotAllowed = errors.New("alwaysTrigger is only valid when detectionType is WEAPON_DETECTED")

// ErrTargetZonesRequired is returned when a SET-scoped rule has no target zones.
var ErrTargetZonesRequired = errors.New("targetZones must be non-empty when zoneScope is SET")

// ErrWindowOutOfRange is returned when a time-window bound is outside 0..1439.
var ErrWindowOutOfRange = errors.New("windowStartMin and windowEndMin must be within 0..1439")

const minuteMax = 1439

// Validate enforces cross-field rules on a create request that gin binding tags
// cannot fully express. It complements the binding tags rather than replacing
// them, so the service boundary rejects invalid rules even if a caller bypasses
// gin binding.
func (r CreateRuleRequest) Validate() error {
	if r.WindowStartMin < 0 || r.WindowStartMin > minuteMax ||
		r.WindowEndMin < 0 || r.WindowEndMin > minuteMax {
		return ErrWindowOutOfRange
	}
	if r.DetectionType == models.DetectionTypeWeapon {
		if r.WeaponClass == nil {
			return ErrWeaponClassRequired
		}
	} else {
		if r.WeaponClass != nil {
			return ErrWeaponClassNotAllowed
		}
		if r.AlwaysTrigger {
			return ErrAlwaysTriggerNotAllowed
		}
	}
	if r.ZoneScope == models.ZoneScopeSet && len(r.TargetZones) == 0 {
		return ErrTargetZonesRequired
	}
	return nil
}

// NewRuleFromCreateRequest builds a Rule model (enabled by default) from a
// validated create request, materializing the SET-scoped target zones as
// RuleTargetZone child rows.
func NewRuleFromCreateRequest(req CreateRuleRequest) models.Rule {
	rule := models.Rule{
		Name:              req.Name,
		Enabled:           true,
		DetectionType:     req.DetectionType,
		WeaponClass:       req.WeaponClass,
		ZoneScope:         req.ZoneScope,
		WindowStartMin:    req.WindowStartMin,
		WindowEndMin:      req.WindowEndMin,
		AlwaysTrigger:     req.AlwaysTrigger,
		ResultingPriority: req.ResultingPriority,
		IncidentType:      req.IncidentType,
	}
	rule.TargetZones = toRuleTargetZones(req.TargetZones)
	return rule
}

// ApplyUpdateRequest applies the provided (non-nil) fields of a patch request to
// an existing rule in place. TargetZones, when provided (non-nil), replace the
// existing set wholesale. The caller is responsible for validating the merged
// result via ValidateUpdatedRule.
func ApplyUpdateRequest(rule *models.Rule, req UpdateRuleRequest) {
	if req.Name != nil {
		rule.Name = *req.Name
	}
	if req.DetectionType != nil {
		rule.DetectionType = *req.DetectionType
	}
	if req.WeaponClass != nil {
		rule.WeaponClass = req.WeaponClass
	}
	if req.ZoneScope != nil {
		rule.ZoneScope = *req.ZoneScope
	}
	if req.TargetZones != nil {
		rule.TargetZones = toRuleTargetZones(req.TargetZones)
	}
	if req.WindowStartMin != nil {
		rule.WindowStartMin = *req.WindowStartMin
	}
	if req.WindowEndMin != nil {
		rule.WindowEndMin = *req.WindowEndMin
	}
	if req.AlwaysTrigger != nil {
		rule.AlwaysTrigger = *req.AlwaysTrigger
	}
	if req.ResultingPriority != nil {
		rule.ResultingPriority = *req.ResultingPriority
	}
	if req.IncidentType != nil {
		rule.IncidentType = *req.IncidentType
	}
}

// ValidateRule enforces the same cross-field invariants as CreateRuleRequest.Validate
// on a fully-formed Rule model, used after applying a partial update to confirm
// the merged rule is still valid before persisting.
func ValidateRule(rule models.Rule) error {
	if rule.WindowStartMin < 0 || rule.WindowStartMin > minuteMax ||
		rule.WindowEndMin < 0 || rule.WindowEndMin > minuteMax {
		return ErrWindowOutOfRange
	}
	if rule.DetectionType == models.DetectionTypeWeapon {
		if rule.WeaponClass == nil {
			return ErrWeaponClassRequired
		}
	} else {
		if rule.WeaponClass != nil {
			return ErrWeaponClassNotAllowed
		}
		if rule.AlwaysTrigger {
			return ErrAlwaysTriggerNotAllowed
		}
	}
	if rule.ZoneScope == models.ZoneScopeSet && len(rule.TargetZones) == 0 {
		return ErrTargetZonesRequired
	}
	return nil
}

func toRuleTargetZones(zoneIDs []uuid.UUID) []models.RuleTargetZone {
	if len(zoneIDs) == 0 {
		return nil
	}
	zones := make([]models.RuleTargetZone, 0, len(zoneIDs))
	for _, id := range zoneIDs {
		zones = append(zones, models.RuleTargetZone{ZoneID: id})
	}
	return zones
}

func ToRuleResponse(r models.Rule) RuleResponse {
	zones := make([]uuid.UUID, 0, len(r.TargetZones))
	for _, z := range r.TargetZones {
		zones = append(zones, z.ZoneID)
	}
	return RuleResponse{
		ID:                r.ID,
		Name:              r.Name,
		Enabled:           r.Enabled,
		DetectionType:     r.DetectionType,
		WeaponClass:       r.WeaponClass,
		ZoneScope:         r.ZoneScope,
		TargetZones:       zones,
		WindowStartMin:    r.WindowStartMin,
		WindowEndMin:      r.WindowEndMin,
		AlwaysTrigger:     r.AlwaysTrigger,
		ResultingPriority: r.ResultingPriority,
		IncidentType:      r.IncidentType,
		CreatedAt:         r.CreatedAt,
		UpdatedAt:         r.UpdatedAt,
	}
}

func ToShiftResponse(s models.Shift) ShiftResponse {
	return ShiftResponse{
		ID:        s.ID,
		GuardID:   s.GuardID,
		ZoneID:    s.ZoneID,
		StartTime: s.StartTime,
		EndTime:   s.EndTime,
	}
}

func ToIncidentResponse(i models.Incident) IncidentResponse {
	return IncidentResponse{
		ID:              i.ID,
		CameraID:        i.CameraID,
		ZoneID:          i.ZoneID,
		Type:            i.Type,
		Priority:        i.Priority,
		RiskScore:       i.RiskScore,
		Status:          i.Status,
		RuleID:          i.RuleID,
		ShiftID:         i.ShiftID,
		AssignedGuardID: i.AssignedGuardID,
		CreatedAt:       i.CreatedAt,
		ClosedAt:        i.ClosedAt,

		ContributingTypes: contributingTypesOrEmpty(i.ContributingTypes),
		PeakPersonCount:   i.PeakPersonCount,
		PeakVehicleCount:  i.PeakVehicleCount,
		WeaponCount:       i.WeaponCount,
		LastActivityAt:    i.LastActivityAt,
		EscalatedAt:       i.EscalatedAt,
	}
}

// contributingTypesOrEmpty makes sure the JSON field is [] rather than null for
// incidents created before situation tracking existed.
func contributingTypesOrEmpty(t []string) []string {
	if t == nil {
		return []string{}
	}
	return t
}

func ToIncidentEventResponse(e models.IncidentEvent) IncidentEventResponse {
	return IncidentEventResponse{
		ID:            e.ID,
		IncidentID:    e.IncidentID,
		Kind:          e.Kind,
		Summary:       e.Summary,
		Reason:        e.Reason,
		WeaponClass:   e.WeaponClass,
		Confidence:    e.Confidence,
		TrackID:       e.TrackID,
		LinkedTrackID: e.LinkedTrackID,
		Snapshot:      e.Snapshot,
		RuleID:        e.RuleID,
		IncidentType:  e.IncidentType,
		Priority:      e.Priority,
		Escalated:     e.Escalated,
		OccurredAt:    e.OccurredAt,
	}
}
