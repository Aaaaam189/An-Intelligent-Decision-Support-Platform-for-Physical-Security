package services

import (
	"errors"
	"log"
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

// isActiveIncidentStatus reports whether an incident in the given status is
// still being worked (i.e. counts against a guard's availability).
func isActiveIncidentStatus(status models.IncidentStatus) bool {
	return status == models.StatusPending || status == models.StatusInProgress
}

// IsGuardOccupied reports whether an on-duty guard is "occupied" per
// Requirement 6.3: a guard assigned to at least one active (PENDING or
// IN_PROGRESS) incident whose severity is CRITICAL or HIGH.
//
// This is the availability-alert / assistance definition of occupancy and is
// intentionally narrower than the "busy" check used for plain assignment
// (which treats any IN_PROGRESS incident as busy). It is exported so the
// assistance and availability-alert logic can reuse it.
func IsGuardOccupied(db *gorm.DB, guardID uuid.UUID) (bool, error) {
	var count int64
	err := db.Model(&models.Incident{}).
		Where("assigned_guard_id = ?", guardID).
		Where("status IN ?", []models.IncidentStatus{models.StatusPending, models.StatusInProgress}).
		Where("priority IN ?", []models.IncidentPriority{models.PriorityCritical, models.PriorityHigh}).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// OccupiedGuardIDs returns, for the provided set of on-duty guard IDs, the
// subset that are occupied per Requirement 6.3 (assigned to at least one
// active CRITICAL/HIGH incident). It runs a single query and is exported so
// callers computing assistance recipients or availability alerts can reuse it.
func OccupiedGuardIDs(db *gorm.DB, guardIDs []uuid.UUID) (map[uuid.UUID]bool, error) {
	occupied := make(map[uuid.UUID]bool)
	if len(guardIDs) == 0 {
		return occupied, nil
	}

	var rows []models.Incident
	err := db.Model(&models.Incident{}).
		Where("assigned_guard_id IN ?", guardIDs).
		Where("status IN ?", []models.IncidentStatus{models.StatusPending, models.StatusInProgress}).
		Where("priority IN ?", []models.IncidentPriority{models.PriorityCritical, models.PriorityHigh}).
		Find(&rows).Error
	if err != nil {
		return nil, err
	}

	for _, inc := range rows {
		if inc.AssignedGuardID != nil {
			occupied[*inc.AssignedGuardID] = true
		}
	}
	return occupied, nil
}

// CreateIncident persists a new incident and applies the assignment invariant:
//   - if at least one on-duty guard for the zone is free, the incident is
//     assigned to one of them (Requirement 5.1);
//   - if no on-duty guard is free and no preemption applies, the incident is
//     persisted in an unassigned PENDING state with no assigned guard
//     (Requirement 5.5);
//   - a CRITICAL incident may preempt an on-duty guard's lower-priority
//     incident when no free guard exists.
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

		log.Printf("DEBUG: now=%s zoneId=%s foundShifts=%d", now.Format(time.RFC3339), req.ZoneID, len(shifts))

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
			log.Printf("DEBUG: no shifts cover this zone/time — creating unassigned incident")
			if err := tx.Create(&incident).Error; err != nil {
				return err
			}
			created = incident
			return nil
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

		log.Printf("DEBUG: onDuty=%v busyCount=%d freeCount=%d", onDutyGuardIDs, len(busyByGuard), len(freeGuardIDs))
		for guardID, inc := range busyByGuard {
			log.Printf("DEBUG: busy guard=%s incidentId=%s priority=%s", guardID, inc.ID, inc.Priority)
		}

		if len(freeGuardIDs) > 0 {
			chosen := freeGuardIDs[rand.Intn(len(freeGuardIDs))]
			shiftID := shiftByGuard[chosen]
			incident.AssignedGuardID = &chosen
			incident.ShiftID = &shiftID
			incident.Status = models.StatusInProgress
			log.Printf("DEBUG: assigning to free guard=%s", chosen)
			if err := tx.Create(&incident).Error; err != nil {
				return err
			}
			created = incident
			return nil
		}

		if req.Priority == models.PriorityCritical {
			var preemptGuard uuid.UUID
			var preemptIncident models.Incident
			lowestRank := priorityRank(models.PriorityCritical)
			found := false

			for guardID, inc := range busyByGuard {
				rank := priorityRank(inc.Priority)
				log.Printf("DEBUG: comparing guard=%s priority=%s rank=%d against lowestRank=%d", guardID, inc.Priority, rank, lowestRank)
				if rank < lowestRank {
					lowestRank = rank
					preemptGuard = guardID
					preemptIncident = inc
					found = true
				}
			}

			log.Printf("DEBUG: preemption search done — found=%v preemptGuard=%s", found, preemptGuard)

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
				log.Printf("DEBUG: preempted guard=%s, assigning new critical incident to them", preemptGuard)
				if err := tx.Create(&incident).Error; err != nil {
					return err
				}
				created = incident
				return nil
			}

			log.Printf("DEBUG: no guard could be preempted — flagging needsAlert")
			needsAlert = true
		}

		if err := tx.Create(&incident).Error; err != nil {
			return err
		}
		created = incident
		return nil
	})

	if err != nil {
		return nil, errors.New("failed to create incident")
	}

	s.publishIncidentCreated(created)

	// Targeted notification events (Requirements 5.2, 5.6). If the incident was
	// assigned to a guard, notify that guard; otherwise it was left unassigned,
	// so escalate to supervisors/coordinators.
	if created.AssignedGuardID != nil {
		s.publishIncidentAssigned(created)
	} else {
		s.publishIncidentUnassigned(created)
	}

	if needsAlert {
		log.Printf("DEBUG: publishing alert for incidentId=%s", created.ID)
		s.alertCriticalUnassigned(created)
	}

	return &created, nil
}

// publishIncidentAssigned emits notification.incident_assigned targeted at the
// guard the incident was handed to (Requirement 5.2). The notification-worker
// delivers this only to the assigned guard, keyed on assignedGuardId.
func (s *IncidentService) publishIncidentAssigned(incident models.Incident) {
	if s.Channel == nil || incident.AssignedGuardID == nil {
		return
	}
	payload := map[string]interface{}{
		"incidentId":      incident.ID,
		"zoneId":          incident.ZoneID,
		"type":            incident.Type,
		"priority":        incident.Priority,
		"status":          incident.Status,
		"assignedGuardId": incident.AssignedGuardID,
		"createdAt":       incident.CreatedAt,
	}
	_ = rabbitmq.Publish(s.Channel, s.ExchangeName, "notification.incident_assigned", payload)
}

// publishIncidentUnassigned emits notification.incident_unassigned when an
// incident is created but no on-duty guard was available to take it
// (Requirement 5.6). The notification-worker routes this to supervisors and
// coordinators by role, so no per-recipient field is required in the payload.
func (s *IncidentService) publishIncidentUnassigned(incident models.Incident) {
	if s.Channel == nil {
		return
	}
	payload := map[string]interface{}{
		"incidentId": incident.ID,
		"zoneId":     incident.ZoneID,
		"type":       incident.Type,
		"priority":   incident.Priority,
		"status":     incident.Status,
		"createdAt":  incident.CreatedAt,
	}
	_ = rabbitmq.Publish(s.Channel, s.ExchangeName, "notification.incident_unassigned", payload)
}

// publishIncidentResolved emits notification.incident_resolved targeted at the
// incident's team — the guards on duty for the incident's zone, excluding the
// guard who resolved it (Requirement 5.4). The recipient set is computed here
// and carried in recipientGuardIds; the resolver is carried in resolverId so
// the notification-worker can exclude them as well.
func (s *IncidentService) publishIncidentResolved(incident models.Incident, resolverID string) {
	if s.Channel == nil {
		return
	}

	teamIDs, err := onDutyGuardsForZone(s.DB, incident.ZoneID, time.Now())
	if err != nil {
		log.Printf("failed to load team for incident %s resolution notification: %v", incident.ID, err)
		teamIDs = nil
	}

	recipients := make([]string, 0, len(teamIDs))
	for _, id := range teamIDs {
		if id.String() == resolverID {
			continue
		}
		recipients = append(recipients, id.String())
	}

	payload := map[string]interface{}{
		"incidentId":        incident.ID,
		"zoneId":            incident.ZoneID,
		"priority":          incident.Priority,
		"status":            incident.Status,
		"resolverId":        resolverID,
		"recipientGuardIds": recipients,
		"closedAt":          incident.ClosedAt,
	}
	_ = rabbitmq.Publish(s.Channel, s.ExchangeName, "notification.incident_resolved", payload)
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

func (s *IncidentService) publishIncidentCreated(incident models.Incident) {
	if s.Channel == nil {
		return
	}
	payload := map[string]interface{}{
		"incidentId":      incident.ID,
		"cameraId":        incident.CameraID,
		"zoneId":          incident.ZoneID,
		"type":            incident.Type,
		"priority":        incident.Priority,
		"status":          incident.Status,
		"assignedGuardId": incident.AssignedGuardID,
		"createdAt":       incident.CreatedAt,
		"closedAt":			 incident.ClosedAt,
	}
	_ = rabbitmq.Publish(s.Channel, s.ExchangeName, "incident.created", payload)
}

func (s *IncidentService) publishStatusChanged(incident models.Incident) {
	if s.Channel == nil {
		return
	}
	payload := map[string]interface{}{
		"incidentId":      incident.ID,
		"zoneId":          incident.ZoneID,
		"priority":        incident.Priority,
		"status":          incident.Status,
		"assignedGuardId": incident.AssignedGuardID,
		"createdAt":       incident.CreatedAt,
		"closedAt":        incident.ClosedAt,
	}
	_ = rabbitmq.Publish(s.Channel, s.ExchangeName, "incident.status_changed", payload)
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
	var resolving bool

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

		// A resolution/closure that transitions the incident out of an active
		// state should notify the team (Requirement 5.4).
		resolving = (req.Status == models.StatusResolved || req.Status == models.StatusClosed) &&
			incident.Status != models.StatusResolved && incident.Status != models.StatusClosed

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

		s.publishStatusChanged(updated)

		if resolving {
			s.publishIncidentResolved(updated, userID)
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