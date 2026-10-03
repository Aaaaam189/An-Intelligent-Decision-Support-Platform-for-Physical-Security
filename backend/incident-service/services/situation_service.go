package services

import (
	"errors"
	"fmt"
	"log"
	"path"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"sentinelai/incident-service/dto"
	"sentinelai/incident-service/models"
	"sentinelai/shared/rabbitmq"
)

// This file turns raw, rule-matched detection events into SITUATIONS.
//
// Old behaviour: every matching event that was not inside a fixed cooldown
// window created its own incident, so one intrusion could become several
// tickets (person, then weapon, then person again after the cooldown).
//
// New behaviour: for a given camera+zone there is at most one OPEN incident
// (PENDING or IN_PROGRESS) whose last activity is within the grace period.
//   - an event arriving while one is open UPDATES it: counters grow, the
//     timeline gets an entry, and priority/type are raised to the most serious
//     rule outcome seen so far (escalation);
//   - an event arriving with no open incident OPENS a new one. A heartbeat
//     ("still present") does so too, except right after a guard resolved the
//     previous incident (see heartbeatMayOpen).
//
// Guards remain in control of the lifecycle: once an incident is RESOLVED or
// CLOSED it stops absorbing events, and the next situation opens a new one.

// incidentTypeRank orders incident types from least to most serious. When a
// later event maps to a higher-ranked type, the incident's headline type is
// upgraded (the previous one is kept in ContributingTypes).
var incidentTypeRank = map[models.IncidentType]int{
	models.TypeOther:               0,
	models.TypeSuspiciousActivity:  1,
	models.TypeCrowdOverflow:       2,
	models.TypeAfterHoursPresence:  3,
	models.TypeUnauthorizedVehicle: 4,
	models.TypeIntrusion:           5,
	models.TypeWeaponDetected:      6,
}

func typeRank(t models.IncidentType) int {
	return incidentTypeRank[t] // unknown types rank 0
}

func (s *IncidentService) gracePeriod() time.Duration {
	if s.GracePeriod <= 0 {
		return defaultGracePeriod
	}
	return s.GracePeriod
}

// situationChange describes what an update did to an open incident.
type situationChange struct {
	escalated    bool
	prevPriority models.IncidentPriority
	prevType     models.IncidentType
	summary      string
}

// IngestEvent applies one rule-matched detection event: it either updates the
// open situation for the event's camera+zone or opens a new incident.
func (s *IncidentService) IngestEvent(req dto.IngestEventRequest) (*dto.IngestEventResponse, error) {
	now := time.Now()
	occurred := eventTime(req.Timestamp, now)

	// 1. Try to attach the event to the open situation.
	open, change, found, err := s.updateOpenSituation(req, occurred, now)
	if err != nil {
		log.Printf("ingest: failed to update open situation (camera=%s zone=%s): %v", req.CameraID, req.ZoneID, err)
		return nil, errors.New("failed to update incident")
	}
	if found {
		if change.escalated {
			s.publishIncidentEscalated(*open, change)
		}
		resp := dto.ToIncidentResponse(*open)
		return &dto.IngestEventResponse{
			Action:    dto.IngestActionUpdated,
			Escalated: change.escalated,
			Incident:  &resp,
		}, nil
	}

	// 2. Nothing open. A heartbeat only means "still there", so it must not
	// reopen a situation a guard has just resolved while the people are still in
	// view. But when there is nothing to resume (no incident yet, or the last one
	// went stale, for example because the backend was restarted and the
	// "presence started" event was missed) the heartbeat opens the incident
	// itself, so a situation that is already in progress is never invisible.
	if req.Heartbeat {
		mayOpen, err := s.heartbeatMayOpen(req, now)
		if err != nil {
			log.Printf("ingest: heartbeat check failed (camera=%s zone=%s): %v", req.CameraID, req.ZoneID, err)
			return nil, errors.New("failed to check incident state")
		}
		if !mayOpen {
			return &dto.IngestEventResponse{Action: dto.IngestActionIgnored}, nil
		}
	}

	// 3. Open a new incident (this also runs guard assignment).
	createReq := dto.CreateIncidentRequest{
		CameraID:  req.CameraID,
		ZoneID:    req.ZoneID,
		Type:      req.IncidentType,
		Priority:  req.Priority,
		RiskScore: req.RiskScore,
		RuleID:    req.RuleID,
	}
	switch req.DetectionType {
	case "PERSON_DETECTED":
		createReq.InitialPersonCount = req.CurrentCount
	case "VEHICLE_DETECTED":
		createReq.InitialVehicleCount = req.CurrentCount
	case "WEAPON_DETECTED":
		createReq.InitialWeaponCount = 1
	}

	created, err := s.CreateIncident(createReq)
	if err != nil {
		return nil, err
	}

	reason := fmt.Sprintf("Rule outcome: %s / %s. Opened a new incident (no open situation on this camera and zone).",
		req.IncidentType, req.Priority)
	if req.Heartbeat {
		reason += " The situation was already in progress when it was first seen."
	}
	event := newIncidentEvent(created.ID, req, occurred, describeEvent(req, false), reason, false)
	if err := s.DB.Create(&event).Error; err != nil {
		// The incident exists and guards were notified; a missing first timeline
		// entry must not fail the whole request.
		log.Printf("ingest: incident %s created but timeline entry failed: %v", created.ID, err)
	}

	resp := dto.ToIncidentResponse(*created)
	return &dto.IngestEventResponse{Action: dto.IngestActionCreated, Incident: &resp}, nil
}

// rearmPeriod is how long after a guard resolves or closes an incident that
// "people are still there" heartbeats stay ignored. After it, continuing
// presence opens a fresh incident (a reminder that the situation never ended).
const rearmPeriod = 10 * time.Minute

// heartbeatMayOpen reports whether a heartbeat that matched no open incident is
// allowed to open one. It is NOT allowed only when the latest incident for the
// camera+zone was resolved or closed by a guard less than rearmPeriod ago.
func (s *IncidentService) heartbeatMayOpen(req dto.IngestEventRequest, now time.Time) (bool, error) {
	var latest models.Incident
	res := s.DB.
		Select("status", "created_at", "last_activity_at", "closed_at").
		Where("camera_id = ? AND zone_id = ?", req.CameraID, req.ZoneID).
		Order("created_at DESC").
		Limit(1).
		Find(&latest)
	if res.Error != nil {
		return false, res.Error
	}
	if res.RowsAffected == 0 {
		return true, nil // nothing was ever raised for this camera and zone
	}
	if latest.Status == models.StatusPending || latest.Status == models.StatusInProgress {
		return true, nil // still open but stale: the situation resumed
	}

	last := latest.CreatedAt
	if latest.LastActivityAt != nil && latest.LastActivityAt.After(last) {
		last = *latest.LastActivityAt
	}
	if latest.ClosedAt != nil && latest.ClosedAt.After(last) {
		last = *latest.ClosedAt
	}
	return now.Sub(last) >= rearmPeriod, nil
}

// updateOpenSituation finds the open incident for the event's camera+zone and
// applies the event to it inside one transaction. found is false when no open
// incident exists (nothing is modified in that case).
func (s *IncidentService) updateOpenSituation(
	req dto.IngestEventRequest, occurred, now time.Time,
) (*models.Incident, situationChange, bool, error) {
	var (
		open   models.Incident
		change situationChange
		found  bool
	)
	cutoff := now.Add(-s.gracePeriod())

	err := s.DB.Transaction(func(tx *gorm.DB) error {
		res := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("camera_id = ? AND zone_id = ? AND status IN ? AND last_activity_at >= ?",
				req.CameraID, req.ZoneID,
				[]models.IncidentStatus{models.StatusPending, models.StatusInProgress},
				cutoff).
			Order("created_at DESC").
			Limit(1).
			Find(&open)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return nil
		}
		found = true

		change.prevPriority = open.Priority
		change.prevType = open.Type

		// --- escalation: headline priority/type follow the most serious outcome
		priorityRaised := priorityRank(req.Priority) > priorityRank(open.Priority)
		typeUpgraded := typeRank(req.IncidentType) > typeRank(open.Type)
		if priorityRaised {
			open.Priority = req.Priority
		}
		if typeUpgraded {
			open.Type = req.IncidentType
		}
		if priorityRaised || typeUpgraded {
			change.escalated = true
			open.EscalatedAt = &occurred
			if req.RuleID != nil {
				open.RuleID = req.RuleID
			}
		}
		if req.RiskScore > open.RiskScore {
			open.RiskScore = req.RiskScore
		}
		if !containsString(open.ContributingTypes, string(req.IncidentType)) {
			open.ContributingTypes = append(open.ContributingTypes, string(req.IncidentType))
		}

		// --- presence levels (0 none, 1 one, 2 several): they only ever go up
		countRaised := false
		switch req.DetectionType {
		case "PERSON_DETECTED":
			if req.CurrentCount > open.PeakPersonCount {
				open.PeakPersonCount = req.CurrentCount
				countRaised = true
			}
		case "VEHICLE_DETECTED":
			if req.CurrentCount > open.PeakVehicleCount {
				open.PeakVehicleCount = req.CurrentCount
				countRaised = true
			}
		case "WEAPON_DETECTED":
			if !req.Heartbeat {
				open.WeaponCount++
			} else if open.WeaponCount == 0 {
				// The first alert never arrived; the weapon is clearly there.
				open.WeaponCount = 1
			}
		}

		open.LastActivityAt = &now
		if err := tx.Model(&open).
			Select("Type", "Priority", "RiskScore", "RuleID", "ContributingTypes",
				"PeakPersonCount", "PeakVehicleCount", "WeaponCount",
				"LastActivityAt", "EscalatedAt").
			Updates(&open).Error; err != nil {
			return err
		}

		// --- timeline: only entries a guard would want to read. A heartbeat
		// that changes nothing just keeps the situation alive.
		notable := !req.Heartbeat || countRaised || change.escalated
		change.summary = describeEvent(req, countRaised)
		if !notable {
			return nil
		}

		reason := fmt.Sprintf("Rule outcome: %s / %s.", req.IncidentType, req.Priority)
		if change.escalated {
			reason += fmt.Sprintf(" Incident escalated from %s / %s to %s / %s.",
				change.prevType, change.prevPriority, open.Type, open.Priority)
		} else {
			reason += " Attached to the open incident for this camera and zone."
		}
		event := newIncidentEvent(open.ID, req, occurred, change.summary, reason, change.escalated)
		return tx.Create(&event).Error
	})
	if err != nil {
		return nil, situationChange{}, false, err
	}
	if !found {
		return nil, situationChange{}, false, nil
	}
	return &open, change, true, nil
}

// GetIncidentEvents returns an incident's timeline, oldest entry first.
func (s *IncidentService) GetIncidentEvents(id string) ([]models.IncidentEvent, error) {
	var incident models.Incident
	if err := s.DB.Select("id").Where("id = ?", id).First(&incident).Error; err != nil {
		return nil, errors.New("incident not found")
	}

	var events []models.IncidentEvent
	if err := s.DB.Where("incident_id = ?", incident.ID).Order("occurred_at ASC").Find(&events).Error; err != nil {
		return nil, errors.New("failed to fetch incident events")
	}
	return events, nil
}

// publishIncidentEscalated tells the people responsible that an existing
// incident just became more serious. The notification-worker delivers it to the
// assigned guard (or to supervisors/coordinators when nobody is assigned) and
// to admins.
func (s *IncidentService) publishIncidentEscalated(incident models.Incident, change situationChange) {
	if s.Channel == nil {
		return
	}
	payload := map[string]interface{}{
		"event":            "INCIDENT_ESCALATED",
		"incidentId":       incident.ID,
		"cameraId":         incident.CameraID,
		"zoneId":           incident.ZoneID,
		"type":             incident.Type,
		"previousType":     change.prevType,
		"priority":         incident.Priority,
		"previousPriority": change.prevPriority,
		"status":           incident.Status,
		"assignedGuardId":  incident.AssignedGuardID,
		"summary":          change.summary,
		"escalatedAt":      incident.EscalatedAt,
	}
	_ = rabbitmq.Publish(s.Channel, s.ExchangeName, "notification.incident_escalated", payload)
}

// --- helpers ----------------------------------------------------------------

func newIncidentEvent(
	incidentID uuid.UUID, req dto.IngestEventRequest, occurred time.Time,
	summary, reason string, escalated bool,
) models.IncidentEvent {
	return models.IncidentEvent{
		IncidentID:    incidentID,
		Kind:          req.DetectionType,
		Summary:       summary,
		Reason:        reason,
		WeaponClass:   req.WeaponClass,
		Confidence:    req.Confidence,
		TrackID:       req.TrackID,
		LinkedTrackID: req.LinkedTrackID,
		Snapshot:      snapshotName(req.Snapshot),
		RuleID:        req.RuleID,
		IncidentType:  string(req.IncidentType),
		Priority:      string(req.Priority),
		Escalated:     escalated,
		OccurredAt:    occurred,
	}
}

// describeEvent builds the human-readable timeline line for an event.
// countRaised reports that this event raised a presence level (e.g. one person -> several).
func describeEvent(req dto.IngestEventRequest, countRaised bool) string {
	switch req.DetectionType {
	case "WEAPON_DETECTED":
		class := "weapon"
		if req.WeaponClass != nil && *req.WeaponClass != "" {
			class = *req.WeaponClass
		}
		text := "Weapon detected: " + class
		if req.Confidence != nil {
			text += fmt.Sprintf(" (%.0f%% confidence)", *req.Confidence*100)
		}
		if n, ok := trackNumber(req.LinkedTrackID, "person-"); ok {
			text += fmt.Sprintf(", near person #%s", n)
		}
		return text

	case "VEHICLE_DETECTED":
		if countRaised && req.Heartbeat {
			return "More than one vehicle detected"
		}
		if req.CurrentCount > 1 {
			return "Vehicles detected"
		}
		return "Vehicle detected"

	case "PERSON_DETECTED":
		if n, ok := trackNumber(req.LinkedTrackID, "vehicle-"); ok {
			return fmt.Sprintf("Person appeared next to vehicle #%s (likely exited it)", n)
		}
		if countRaised && req.Heartbeat {
			return "More than one person detected"
		}
		if req.CurrentCount > 1 {
			return "People detected"
		}
		return "Person detected"
	}
	return req.DetectionType
}

// trackNumber extracts the numeric part of a prefixed track id ("vehicle-4" -> "4").
func trackNumber(id *string, prefix string) (string, bool) {
	if id == nil || !strings.HasPrefix(*id, prefix) {
		return "", false
	}
	n := strings.TrimPrefix(*id, prefix)
	return n, n != ""
}

// snapshotName reduces a snapshot path to its file name; ai-service serves
// evidence images by name at /snapshots/<name>.
func snapshotName(p *string) *string {
	if p == nil || strings.TrimSpace(*p) == "" {
		return nil
	}
	name := path.Base(strings.ReplaceAll(*p, "\\", "/"))
	if name == "." || name == "/" {
		return nil
	}
	return &name
}

// eventTime uses the event's own timestamp, but never one that is in the future
// (clock skew between containers), falling back to now.
func eventTime(ts *time.Time, now time.Time) time.Time {
	if ts == nil || ts.IsZero() {
		return now
	}
	if ts.After(now.Add(time.Minute)) {
		return now
	}
	return *ts
}

func containsString(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}