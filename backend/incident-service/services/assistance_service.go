package services

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"sentinelai/incident-service/models"
)

// isOccupiedSeverity reports whether an incident priority counts toward a
// guard being "occupied" for assistance purposes. Per Requirement 6.3, an
// occupied guard is an on-duty guard currently assigned to at least one
// active incident of CRITICAL or HIGH severity.
func isOccupiedSeverity(p models.IncidentPriority) bool {
	return p == models.PriorityCritical || p == models.PriorityHigh
}

// isActiveStatus reports whether an incident status counts as an active
// incident (i.e. one a guard is currently handling). Active incidents are
// those in progress; resolved/closed incidents no longer occupy a guard.
func isActiveStatus(s models.IncidentStatus) bool {
	return s == models.StatusInProgress
}

// AssistanceRecipients is a pure function that, given the set of on-duty
// guards, the set of guards that are occupied (assigned to at least one
// active critical/high incident), and the requesting guard, returns the set
// of guards that should be notified of an assistance request.
//
// The recipient set is exactly the on-duty guards who are not occupied and
// not the requesting guard (Requirement 6.3). The result is deterministic:
// it preserves the order of onDutyGuardIDs and contains no duplicates.
func AssistanceRecipients(onDutyGuardIDs []uuid.UUID, occupiedGuardIDs map[uuid.UUID]bool, requestingGuardID uuid.UUID) []uuid.UUID {
	recipients := make([]uuid.UUID, 0, len(onDutyGuardIDs))
	seen := make(map[uuid.UUID]bool, len(onDutyGuardIDs))
	for _, id := range onDutyGuardIDs {
		if id == requestingGuardID {
			continue
		}
		if occupiedGuardIDs[id] {
			continue
		}
		if seen[id] {
			continue
		}
		seen[id] = true
		recipients = append(recipients, id)
	}
	return recipients
}

// occupiedGuardSet queries which of the given on-duty guards are occupied,
// i.e. assigned to at least one active (IN_PROGRESS) incident of CRITICAL or
// HIGH severity (Requirement 6.3). It is defined locally here to avoid
// touching incident_service.go.
func occupiedGuardSet(tx *gorm.DB, onDutyGuardIDs []uuid.UUID) (map[uuid.UUID]bool, error) {
	occupied := make(map[uuid.UUID]bool, len(onDutyGuardIDs))
	if len(onDutyGuardIDs) == 0 {
		return occupied, nil
	}

	var incidents []models.Incident
	if err := tx.Where(
		"status = ? AND priority IN ? AND assigned_guard_id IN ?",
		models.StatusInProgress,
		[]models.IncidentPriority{models.PriorityCritical, models.PriorityHigh},
		onDutyGuardIDs,
	).Find(&incidents).Error; err != nil {
		return nil, err
	}

	for _, inc := range incidents {
		if inc.AssignedGuardID != nil {
			occupied[*inc.AssignedGuardID] = true
		}
	}
	return occupied, nil
}

// onDutyGuardsForZone returns the guard IDs that are currently on duty for a
// zone, based on shifts that cover the current time.
func onDutyGuardsForZone(tx *gorm.DB, zoneID uuid.UUID, now time.Time) ([]uuid.UUID, error) {
	var shifts []models.Shift
	if err := tx.Where("zone_id = ? AND start_time <= ? AND end_time >= ?", zoneID, now, now).
		Find(&shifts).Error; err != nil {
		return nil, err
	}

	guardIDs := make([]uuid.UUID, 0, len(shifts))
	seen := make(map[uuid.UUID]bool, len(shifts))
	for _, sh := range shifts {
		if seen[sh.GuardID] {
			continue
		}
		seen[sh.GuardID] = true
		guardIDs = append(guardIDs, sh.GuardID)
	}
	return guardIDs, nil
}

// AssistanceResult captures the outcome of recording an assistance request:
// the persisted request and the set of guards that should be notified.
type AssistanceResult struct {
	Request    models.AssistanceRequest
	Recipients []uuid.UUID
}

// RecordAssistanceRequest records an assistance request raised by the assigned
// guard on an incident (Requirement 6.1). It is transactional: if recording
// fails, the incident is left unchanged and an error is returned so the caller
// can report that the request was not recorded (Requirement 6.2).
//
// On success it also computes the set of available guards (on-duty, not
// occupied, not the requesting guard) that should receive an assistance
// notification (Requirement 6.3).
func (s *IncidentService) RecordAssistanceRequest(incidentID string, requestingGuardID uuid.UUID) (*AssistanceResult, error) {
	var result AssistanceResult

	err := s.DB.Transaction(func(tx *gorm.DB) error {
		var incident models.Incident
		if err := tx.Where("id = ?", incidentID).First(&incident).Error; err != nil {
			return errors.New("incident not found")
		}

		// Only the assigned guard may raise assistance on their incident.
		if incident.AssignedGuardID == nil || *incident.AssignedGuardID != requestingGuardID {
			return errors.New("only the assigned guard can request assistance on this incident")
		}

		request := models.AssistanceRequest{
			IncidentID:        incident.ID,
			RequestingGuardID: requestingGuardID,
		}
		if err := tx.Create(&request).Error; err != nil {
			return err
		}

		now := time.Now()
		onDuty, err := onDutyGuardsForZone(tx, incident.ZoneID, now)
		if err != nil {
			return err
		}

		occupied, err := occupiedGuardSet(tx, onDuty)
		if err != nil {
			return err
		}

		result.Request = request
		result.Recipients = AssistanceRecipients(onDuty, occupied, requestingGuardID)
		return nil
	})

	if err != nil {
		return nil, err
	}

	return &result, nil
}
