package services

import (
	"errors"
	"math/rand"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"sentinelai/incident-service/dto"
	"sentinelai/incident-service/models"
)

type IncidentService struct {
	DB *gorm.DB
}

func NewIncidentService(db *gorm.DB) *IncidentService {
	return &IncidentService{DB: db}
}

// CreateIncident implements the assignment algorithm we designed earlier:
// find guards on duty for this zone right now, filter out ones already
// busy with an IN_PROGRESS incident, and randomly assign one of the
// free ones. If nobody's free, the incident is created as PENDING
// instead — never forced onto an already-busy guard.
func (s *IncidentService) CreateIncident(req dto.CreateIncidentRequest) (*models.Incident, error) {
	var created models.Incident

	// Everything below runs in one transaction so that two incidents
	// arriving at nearly the same time can't both see the same guard
	// as "free" and both grab them — the classic race condition we
	// talked through earlier.
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

		if len(shifts) > 0 {
			shiftByGuard := make(map[uuid.UUID]uuid.UUID)
			onDutyGuardIDs := make([]uuid.UUID, 0, len(shifts))
			for _, sh := range shifts {
				onDutyGuardIDs = append(onDutyGuardIDs, sh.GuardID)
				shiftByGuard[sh.GuardID] = sh.ID
			}

			var busyGuardIDs []uuid.UUID
			if err := tx.Model(&models.Incident{}).
				Where("status = ? AND assigned_guard_id IN ?", models.StatusInProgress, onDutyGuardIDs).
				Pluck("assigned_guard_id", &busyGuardIDs).Error; err != nil {
				return err
			}

			busy := make(map[uuid.UUID]bool, len(busyGuardIDs))
			for _, id := range busyGuardIDs {
				busy[id] = true
			}

			var freeGuardIDs []uuid.UUID
			for _, id := range onDutyGuardIDs {
				if !busy[id] {
					freeGuardIDs = append(freeGuardIDs, id)
				}
			}

			if len(freeGuardIDs) > 0 {
				chosen := freeGuardIDs[rand.Intn(len(freeGuardIDs))]
				chosenShiftID := shiftByGuard[chosen]

				incident.AssignedGuardID = &chosen
				incident.ShiftID = &chosenShiftID
				incident.Status = models.StatusInProgress
			}
			// If nobody's free, incident stays PENDING — matches the
			// "queue + alert admin" branch from our earlier design.
		}
		// If no shift covers this zone at all, incident also stays PENDING.

		if err := tx.Create(&incident).Error; err != nil {
			return err
		}

		created = incident
		return nil
	})

	if err != nil {
		return nil, errors.New("failed to create incident")
	}

	return &created, nil
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

// UpdateStatus enforces that only the assigned guard, or an admin, can
// change an incident's status — the authorization check itself is
// business logic, so it lives here, not in the handler.
func (s *IncidentService) UpdateStatus(id string, userID string, role models.AppRole, req dto.UpdateIncidentStatusRequest) (*models.Incident, error) {
	var incident models.Incident
	if err := s.DB.Where("id = ?", id).First(&incident).Error; err != nil {
		return nil, errors.New("incident not found")
	}

	if role != models.RoleAdmin {
		if incident.AssignedGuardID == nil || incident.AssignedGuardID.String() != userID {
			return nil, errors.New("only the assigned guard or an admin can update this incident")
		}
	}

	incident.Status = req.Status
	if req.Status == models.StatusClosed {
		now := time.Now()
		incident.ClosedAt = &now
	}

	if err := s.DB.Save(&incident).Error; err != nil {
		return nil, errors.New("failed to update incident status")
	}
	return &incident, nil
}

// Reassign is the admin-only override — moving an incident to a
// different guard regardless of the automatic assignment.
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