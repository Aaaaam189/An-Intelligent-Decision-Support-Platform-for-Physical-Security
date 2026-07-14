package services

import (
	"errors"
	"math/rand"
	"time"

	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
	"gorm.io/gorm"

	"sentinelai/incident-service/dto"
	"sentinelai/incident-service/models"
	"sentinelai/shared/rabbitmq"
)

type IncidentService struct {
	DB           *gorm.DB
	Channel      *amqp.Channel
	ExchangeName string
}

func NewIncidentService(db *gorm.DB, ch *amqp.Channel, exchangeName string) *IncidentService {
	return &IncidentService{DB: db, Channel: ch, ExchangeName: exchangeName}
}

func priorityRank(p models.IncidentPriority) int {
	switch p {
	case models.PriorityLow:
		return 1
	case models.PriorityMedium:
		return 2
	case models.PriorityHigh:
		return 3
	case models.PriorityCritical:
		return 4
	default:
		return 0
	}
}

func (s *IncidentService) CreateIncident(req dto.CreateIncidentRequest) (*models.Incident, error) {
	var created models.Incident
	var needsAlert bool

	err := s.DB.Transaction(func(tx *gorm.DB) error {
		now := time.Now()

		var shifts []models.Shift
		if err := tx.Where("zone_id = ? AND start_time <= ? AND end_time >= ?", req.ZoneID, now, now).
			Find(&shifts).Error; err != nil {
			return err
		}

		incident := models.Incident{
			CameraID:  req.CameraID,
			ZoneID:    req.ZoneID,
			Type:      req.Type,
			Priority:  req.Priority,
			RiskScore: req.RiskScore,
			RuleID:    req.RuleID,
			Status:    models.StatusPending,
		}

		if len(shifts) == 0 {
			return tx.Create(&incident).Error
		}

		shiftByGuard := make(map[uuid.UUID]uuid.UUID)
		onDutyGuardIDs := make([]uuid.UUID, 0, len(shifts))
		for _, sh := range shifts {
			onDutyGuardIDs = append(onDutyGuardIDs, sh.GuardID)
			shiftByGuard[sh.GuardID] = sh.ID
		}

		var busyIncidents []models.Incident
		if err := tx.Where("status = ? AND assigned_guard_id IN ?", models.StatusInProgress, onDutyGuardIDs).
			Find(&busyIncidents).Error; err != nil {
			return err
		}

		busyByGuard := make(map[uuid.UUID]models.Incident, len(busyIncidents))
		for _, inc := range busyIncidents {
			busyByGuard[*inc.AssignedGuardID] = inc
		}

		var freeGuardIDs []uuid.UUID
		for _, id := range onDutyGuardIDs {
			if _, busy := busyByGuard[id]; !busy {
				freeGuardIDs = append(freeGuardIDs, id)
			}
		}

		// Case 1: a free guard exists — the original happy path.
		if len(freeGuardIDs) > 0 {
			chosen := freeGuardIDs[rand.Intn(len(freeGuardIDs))]
			shiftID := shiftByGuard[chosen]
			incident.AssignedGuardID = &chosen
			incident.ShiftID = &shiftID
			incident.Status = models.StatusInProgress
			return tx.Create(&incident).Error
		}

		// Case 2: nobody free — for CRITICAL incidents only, try to
		// preempt whichever busy guard is handling the least urgent thing.
		if req.Priority == models.PriorityCritical {
			var preemptGuard uuid.UUID
			var preemptIncident models.Incident
			lowestRank := priorityRank(models.PriorityCritical)
			found := false

			for guardID, inc := range busyByGuard {
				rank := priorityRank(inc.Priority)
				if rank < lowestRank {
					lowestRank = rank
					preemptGuard = guardID
					preemptIncident = inc
					found = true
				}
			}

			if found {
				preemptIncident.Status = models.StatusPending
				preemptIncident.AssignedGuardID = nil
				preemptIncident.ShiftID = nil
				if err := tx.Save(&preemptIncident).Error; err != nil {
					return err
				}

				shiftID := shiftByGuard[preemptGuard]
				incident.AssignedGuardID = &preemptGuard
				incident.ShiftID = &shiftID
				incident.Status = models.StatusInProgress
				return tx.Create(&incident).Error
			}

			// Case 3: everyone busy is equally or more critical —
			// nobody can be preempted. Flag for an alert after the
			// transaction commits.
			needsAlert = true
		}

		return tx.Create(&incident).Error
	})

	if err != nil {
		return nil, errors.New("failed to create incident")
	}

	if err := s.DB.Where("id = ?", created.ID).First(&created).Error; err == nil && needsAlert {
		s.alertCriticalUnassigned(created)
	}

	return &created, nil
}

// alertCriticalUnassigned publishes an event that notification-worker
// (built next) will turn into a real dashboard alarm for the admin.
func (s *IncidentService) alertCriticalUnassigned(incident models.Incident) {
	if s.Channel == nil {
		return
	}
	payload := map[string]interface{}{
		"incidentId": incident.ID,
		"zoneId":     incident.ZoneID,
		"priority":   incident.Priority,
		"message":    "Critical incident has no available guard, even after preemption",
	}
	_ = rabbitmq.Publish(s.Channel, s.ExchangeName, "alert.critical_unassigned", payload)
}

func (s *IncidentService) GetAllIncidents() ([]models.Incident, error) {
	var incidents []models.Incident
	if err := s.DB.Order("created_at desc").Find(&incidents).Error; err != nil {
		return nil, errors.New("failed to fetch incidents")
	}
	return incidents, nil
}

func (s *IncidentService) GetIncidentByID(id string) (*models.Incident, error) {
	var incident models.Incident
	if err := s.DB.Where("id = ?", id).First(&incident).Error; err != nil {
		return nil, errors.New("incident not found")
	}
	return &incident, nil
}

// findActiveShift looks up whether a guard is still on duty for a
// zone right now — used to figure out what shift to attach to a
// newly auto-assigned incident.
func findActiveShift(tx *gorm.DB, guardID, zoneID uuid.UUID) (*models.Shift, error) {
	var shift models.Shift
	now := time.Now()
	err := tx.Where("guard_id = ? AND zone_id = ? AND start_time <= ? AND end_time >= ?",
		guardID, zoneID, now, now).First(&shift).Error
	if err != nil {
		return nil, err
	}
	return &shift, nil
}

// tryAutoAssignPending is called right after a guard is freed up —
// it looks for the oldest, highest-priority PENDING incident in that
// guard's zone and hands it to them immediately, instead of leaving
// it to sit until someone notices.
func (s *IncidentService) tryAutoAssignPending(tx *gorm.DB, guardID, zoneID uuid.UUID) error {
	shift, err := findActiveShift(tx, guardID, zoneID)
	if err != nil {
		// Guard's shift for this zone has already ended — nothing to
		// hand them, they're leaving anyway.
		return nil
	}

	var pending []models.Incident
	if err := tx.Where("status = ? AND zone_id = ?", models.StatusPending, zoneID).
		Order("CASE priority WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END DESC, created_at ASC").
		Find(&pending).Error; err != nil {
		return err
	}

	if len(pending) == 0 {
		return nil
	}

	next := pending[0]
	next.AssignedGuardID = &guardID
	next.ShiftID = &shift.ID
	next.Status = models.StatusInProgress
	return tx.Save(&next).Error
}

func (s *IncidentService) UpdateStatus(id string, userID string, role models.AppRole, req dto.UpdateIncidentStatusRequest) (*models.Incident, error) {
	var updated models.Incident

	err := s.DB.Transaction(func(tx *gorm.DB) error {
		var incident models.Incident
		if err := tx.Where("id = ?", id).First(&incident).Error; err != nil {
			return errors.New("incident not found")
		}

		if role != models.RoleAdmin {
			if incident.AssignedGuardID == nil || incident.AssignedGuardID.String() != userID {
				return errors.New("only the assigned guard or an admin can update this incident")
			}
		}

		freeingUp := (req.Status == models.StatusResolved || req.Status == models.StatusClosed) &&
			incident.Status == models.StatusInProgress

		var freedGuardID *uuid.UUID
		var freedZoneID uuid.UUID
		if freeingUp {
			freedGuardID = incident.AssignedGuardID
			freedZoneID = incident.ZoneID
		}

		incident.Status = req.Status
		if req.Status == models.StatusClosed {
			now := time.Now()
			incident.ClosedAt = &now
		}

		if err := tx.Save(&incident).Error; err != nil {
			return err
		}
		updated = incident

		if freeingUp && freedGuardID != nil {
			return s.tryAutoAssignPending(tx, *freedGuardID, freedZoneID)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}
	return &updated, nil
}

func (s *IncidentService) Reassign(id string, req dto.ReassignIncidentRequest) (*models.Incident, error) {
	var incident models.Incident
	if err := s.DB.Where("id = ?", id).First(&incident).Error; err != nil {
		return nil, errors.New("incident not found")
	}

	incident.AssignedGuardID = &req.GuardID
	if incident.Status == models.StatusPending {
		incident.Status = models.StatusInProgress
	}

	if err := s.DB.Save(&incident).Error; err != nil {
		return nil, errors.New("failed to reassign incident")
	}
	return &incident, nil
}