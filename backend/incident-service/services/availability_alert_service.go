package services

import (
	"errors"

	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
	"gorm.io/gorm"

	"sentinelai/incident-service/models"
	"sentinelai/shared/rabbitmq"
)

// AvailabilityAlertService owns the lifecycle of AvailabilityAlert records.
//
// This file contains ONLY the creation-side logic (Requirements 6.4, 7.1,
// 7.2): raising an availability alert when a critical/high situation cannot be
// covered because every on-duty guard is occupied, and doing so idempotently
// per triggering incident. The acknowledge/resolve state machine
// (Requirements 7.5, 7.6) is added separately by task 9.8 as additional
// methods on this same type in another file — keep this file creation-only so
// the two efforts do not conflict.
type AvailabilityAlertService struct {
	DB           *gorm.DB
	Channel      *amqp.Channel
	ExchangeName string
}

// NewAvailabilityAlertService constructs an AvailabilityAlertService.
func NewAvailabilityAlertService(db *gorm.DB, ch *amqp.Channel, exchangeName string) *AvailabilityAlertService {
	return &AvailabilityAlertService{DB: db, Channel: ch, ExchangeName: exchangeName}
}

// ListAvailabilityAlerts returns all availability alerts ordered by creation
// time, most recent first. It backs the admin/supervisor-facing
// GET /availability-alerts endpoint.
func (s *AvailabilityAlertService) ListAvailabilityAlerts() ([]models.AvailabilityAlert, error) {
	var alerts []models.AvailabilityAlert
	if err := s.DB.Order("created_at DESC").Find(&alerts).Error; err != nil {
		return nil, err
	}
	return alerts, nil
}

// hasUnresolvedAlert reports whether an unresolved (OPEN or ACKNOWLEDGED)
// availability alert already exists for the given triggering incident. It is
// the de-duplication check backing Requirement 7.2. The provided tx is used so
// the check and any subsequent insert run in the same transaction.
func hasUnresolvedAlert(tx *gorm.DB, triggeringIncidentID uuid.UUID) (bool, error) {
	var count int64
	err := tx.Model(&models.AvailabilityAlert{}).
		Where("triggering_incident_id = ?", triggeringIncidentID).
		Where("status IN ?", []models.AvailabilityAlertStatus{
			models.AvailabilityAlertStatusOpen,
			models.AvailabilityAlertStatusAcknowledged,
		}).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// CreateAvailabilityAlertIfUncoverable creates exactly one AvailabilityAlert
// for a critical/high incident (or assistance request) that cannot be covered
// because every OTHER on-duty guard is occupied per Requirement 6.3 (an
// occupied guard is an on-duty guard assigned to at least one active
// CRITICAL/HIGH incident).
//
// Behaviour (Requirements 6.4, 7.1, 7.2):
//   - If the triggering incident is not CRITICAL or HIGH, no alert is created.
//   - If at least one of the provided other on-duty guards is NOT occupied,
//     the situation is coverable and no alert is created.
//   - Otherwise (every other on-duty guard is occupied), an alert referencing
//     triggeringIncidentID is created — but only if no unresolved alert
//     already exists for that incident (idempotent per triggering incident).
//
// otherOnDutyGuardIDs is the set of on-duty guards eligible to cover the
// situation, excluding any guard that is irrelevant to coverage (for an
// assistance request, the caller should exclude the requesting guard). An
// empty set means there is no one who could cover it, which is treated as
// uncoverable.
//
// It returns the alert that exists for the incident after the call (either the
// newly created one or the pre-existing unresolved one) and a boolean
// indicating whether a NEW alert was created. When no alert is warranted it
// returns (nil, false, nil).
func (s *AvailabilityAlertService) CreateAvailabilityAlertIfUncoverable(
	triggeringIncidentID uuid.UUID,
	incidentPriority models.IncidentPriority,
	otherOnDutyGuardIDs []uuid.UUID,
) (*models.AvailabilityAlert, bool, error) {
	// Only CRITICAL/HIGH situations escalate to an availability alert
	// (Requirements 6.4, 7.1).
	if incidentPriority != models.PriorityCritical && incidentPriority != models.PriorityHigh {
		return nil, false, nil
	}

	// Determine coverability: if any other on-duty guard is free (not
	// occupied), the situation is coverable and no alert is warranted.
	occupied, err := OccupiedGuardIDs(s.DB, otherOnDutyGuardIDs)
	if err != nil {
		return nil, false, err
	}
	for _, id := range otherOnDutyGuardIDs {
		if !occupied[id] {
			// A free guard exists — coverable, no alert.
			return nil, false, nil
		}
	}

	// Every other on-duty guard is occupied (or there are none) — the
	// situation is uncoverable. Create an alert idempotently.
	var alert models.AvailabilityAlert
	var createdNew bool

	err = s.DB.Transaction(func(tx *gorm.DB) error {
		exists, err := hasUnresolvedAlert(tx, triggeringIncidentID)
		if err != nil {
			return err
		}
		if exists {
			// An unresolved alert already exists for this incident — do not
			// create another (Requirement 7.2). Load and return it.
			return tx.Where("triggering_incident_id = ?", triggeringIncidentID).
				Where("status IN ?", []models.AvailabilityAlertStatus{
					models.AvailabilityAlertStatusOpen,
					models.AvailabilityAlertStatusAcknowledged,
				}).
				Order("created_at ASC").
				First(&alert).Error
		}

		alert = models.AvailabilityAlert{
			TriggeringIncidentID: triggeringIncidentID,
			Status:               models.AvailabilityAlertStatusOpen,
		}
		if err := tx.Create(&alert).Error; err != nil {
			return err
		}
		createdNew = true
		return nil
	})
	if err != nil {
		return nil, false, errors.New("failed to create availability alert")
	}

	if createdNew {
		s.publishAvailabilityCreated(alert)
	}

	return &alert, createdNew, nil
}

// publishAvailabilityCreated emits the alert.availability_created event so the
// notification-worker can notify connected admins/supervisors (Requirement
// 7.3) and the analytics-worker can persist the alert (Requirement 7.4). The
// acknowledge/resolve events are published by task 9.8.
func (s *AvailabilityAlertService) publishAvailabilityCreated(alert models.AvailabilityAlert) {
	if s.Channel == nil {
		return
	}
	// Field name is "id" (not "alertId") to line up with the analytics-worker
	// and notification-worker consumers, which key the alert on its "id".
	payload := map[string]interface{}{
		"id":                   alert.ID,
		"triggeringIncidentId": alert.TriggeringIncidentID,
		"status":               alert.Status,
		"createdAt":            alert.CreatedAt,
	}
	_ = rabbitmq.Publish(s.Channel, s.ExchangeName, "alert.availability_created", payload)
}

// PublishAvailabilityAcknowledged emits alert.availability_acknowledged so the
// analytics-worker can keep its mirrored copy of the alert in sync with the
// incident-service source of truth (Requirements 7.4, 7.5). It is published by
// the handler after a successful acknowledge transition. Payload field names
// (id, acknowledgedBy, acknowledgedAt) match the analytics-worker consumer.
func (s *AvailabilityAlertService) PublishAvailabilityAcknowledged(alert models.AvailabilityAlert) {
	if s.Channel == nil {
		return
	}
	payload := map[string]interface{}{
		"id":                   alert.ID,
		"triggeringIncidentId": alert.TriggeringIncidentID,
		"status":               alert.Status,
		"acknowledgedBy":       alert.AcknowledgedBy,
		"acknowledgedAt":       alert.AcknowledgedAt,
		"createdAt":            alert.CreatedAt,
	}
	_ = rabbitmq.Publish(s.Channel, s.ExchangeName, "alert.availability_acknowledged", payload)
}

// PublishAvailabilityResolved emits alert.availability_resolved so the
// analytics-worker can record the alert as resolved (Requirements 7.4, 7.6).
// It is published by the handler after a successful resolve transition.
// Payload field names (id, resolvedBy, resolvedAt) match the analytics-worker
// consumer.
func (s *AvailabilityAlertService) PublishAvailabilityResolved(alert models.AvailabilityAlert) {
	if s.Channel == nil {
		return
	}
	payload := map[string]interface{}{
		"id":                   alert.ID,
		"triggeringIncidentId": alert.TriggeringIncidentID,
		"status":               alert.Status,
		"resolvedBy":           alert.ResolvedBy,
		"resolvedAt":           alert.ResolvedAt,
		"createdAt":            alert.CreatedAt,
	}
	_ = rabbitmq.Publish(s.Channel, s.ExchangeName, "alert.availability_resolved", payload)
}
