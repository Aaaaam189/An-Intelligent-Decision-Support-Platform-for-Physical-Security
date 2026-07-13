package dto

import "sentinelai/incident-service/models"

func ToRuleResponse(r models.Rule) RuleResponse {
	return RuleResponse{
		ID:                r.ID,
		Name:              r.Name,
		Condition:         r.Condition,
		ResultingPriority: r.ResultingPriority,
		CreatedAt:         r.CreatedAt,
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
	}
}