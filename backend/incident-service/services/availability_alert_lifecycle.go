package services

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"sentinelai/incident-service/models"
)

// Availability-alert lifecycle errors. These are defined here (rather than on a
// service struct) so the acknowledge/resolve state machine can live in its own
// file and operate on a *gorm.DB directly, avoiding a duplicate service-type
// declaration with the alert-creation logic (task 9.6).
var (
	// ErrAvailabilityAlertNotFound is returned when an alert cannot be located
	// by id.
	ErrAvailabilityAlertNotFound = errors.New("availability alert not found")
	// ErrAvailabilityAlertResolved is returned when an operation is attempted
	// on an already-resolved alert that the state machine forbids (e.g.
	// acknowledging a resolved alert). RESOLVED is terminal (Requirement 6.6).
	ErrAvailabilityAlertResolved = errors.New("availability alert is already resolved and cannot change state")
)

// AcknowledgeAvailabilityAlert transitions an availability alert to the
// ACKNOWLEDGED state, recording the acknowledging user and an acknowledgement
// timestamp (Requirement 7.5).
//
// The transition is transactional and enforces the lifecycle invariants
// (Requirement 6.6):
//   - A RESOLVED alert is terminal: it can never return to ACKNOWLEDGED, so
//     acknowledging a resolved alert is rejected with
//     ErrAvailabilityAlertResolved and the record is left unchanged.
//   - The acknowledged and resolved states are mutually exclusive; on
//     acknowledgement the resolve fields remain unset.
//
// It returns the updated alert on success.
func AcknowledgeAvailabilityAlert(db *gorm.DB, alertID uuid.UUID, userID uuid.UUID) (*models.AvailabilityAlert, error) {
	var alert models.AvailabilityAlert

	err := db.Transaction(func(tx *gorm.DB) error {
		// Lock the row for the duration of the transaction so concurrent
		// acknowledge/resolve calls cannot race the status check.
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", alertID).
			First(&alert).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrAvailabilityAlertNotFound
			}
			return err
		}

		// RESOLVED is terminal: a resolved alert can never return to the
		// acknowledged state (Requirement 6.6).
		if alert.Status == models.AvailabilityAlertStatusResolved {
			return ErrAvailabilityAlertResolved
		}

		now := time.Now().UTC()
		alert.Status = models.AvailabilityAlertStatusAcknowledged
		alert.AcknowledgedBy = &userID
		alert.AcknowledgedAt = &now

		return tx.Model(&alert).
			Updates(map[string]interface{}{
				"status":          alert.Status,
				"acknowledged_by": alert.AcknowledgedBy,
				"acknowledged_at": alert.AcknowledgedAt,
			}).Error
	})

	if err != nil {
		return nil, err
	}
	return &alert, nil
}

// ResolveAvailabilityAlert transitions an availability alert to the terminal
// RESOLVED state, recording the resolving user and a resolution timestamp
// (Requirement 7.6).
//
// The transition is transactional and enforces the lifecycle invariants
// (Requirement 6.6):
//   - RESOLVED is terminal; resolving an already-resolved alert is a no-op that
//     returns the existing record unchanged (idempotent).
//   - Resolving is permitted from either OPEN or ACKNOWLEDGED; once resolved,
//     the alert cannot return to ACKNOWLEDGED, keeping the acknowledged and
//     resolved states mutually exclusive.
//
// It returns the resolved alert on success.
func ResolveAvailabilityAlert(db *gorm.DB, alertID uuid.UUID, userID uuid.UUID) (*models.AvailabilityAlert, error) {
	var alert models.AvailabilityAlert

	err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", alertID).
			First(&alert).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrAvailabilityAlertNotFound
			}
			return err
		}

		// RESOLVED is terminal and mutually exclusive with ACKNOWLEDGED. If the
		// alert is already resolved, treat resolve as an idempotent no-op and
		// leave the original resolving user/timestamp intact.
		if alert.Status == models.AvailabilityAlertStatusResolved {
			return nil
		}

		now := time.Now().UTC()
		alert.Status = models.AvailabilityAlertStatusResolved
		alert.ResolvedBy = &userID
		alert.ResolvedAt = &now

		return tx.Model(&alert).
			Updates(map[string]interface{}{
				"status":      alert.Status,
				"resolved_by": alert.ResolvedBy,
				"resolved_at": alert.ResolvedAt,
			}).Error
	})

	if err != nil {
		return nil, err
	}
	return &alert, nil
}
