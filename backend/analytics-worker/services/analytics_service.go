package services

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"sentinelai/analytics-worker/models"
)

type AnalyticsService struct {
	DB *gorm.DB
}

func NewAnalyticsService(db *gorm.DB) *AnalyticsService {
	return &AnalyticsService{DB: db}
}

// Upsert inserts a new incident row, or updates the existing one if
// this incident has already been seen before (e.g. a status change
// arriving after the original creation event).
func (s *AnalyticsService) Upsert(stat models.IncidentStat) error {
	return s.DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "incident_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"zone_id", "priority", "status", "assigned_guard_id", "closed_at", "updated_at",
		}),
	}).Create(&stat).Error
}

type Summary struct {
	TotalIncidents      int64            `json:"totalIncidents"`
	ByPriority          map[string]int64 `json:"byPriority"`
	ByStatus            map[string]int64 `json:"byStatus"`
	ByZone              map[string]int64 `json:"byZone"`
	AvgResolutionSeconds *float64        `json:"avgResolutionSeconds"`
}

func (s *AnalyticsService) GetSummary() (*Summary, error) {
	summary := &Summary{
		ByPriority: make(map[string]int64),
		ByStatus:   make(map[string]int64),
		ByZone:     make(map[string]int64),
	}

	if err := s.DB.Model(&models.IncidentStat{}).Count(&summary.TotalIncidents).Error; err != nil {
		return nil, err
	}

	var priorityRows []struct {
		Priority string
		Count    int64
	}
	s.DB.Model(&models.IncidentStat{}).Select("priority, count(*) as count").Group("priority").Scan(&priorityRows)
	for _, r := range priorityRows {
		summary.ByPriority[r.Priority] = r.Count
	}

	var statusRows []struct {
		Status string
		Count  int64
	}
	s.DB.Model(&models.IncidentStat{}).Select("status, count(*) as count").Group("status").Scan(&statusRows)
	for _, r := range statusRows {
		summary.ByStatus[r.Status] = r.Count
	}

	var zoneRows []struct {
		ZoneID string
		Count  int64
	}
	s.DB.Model(&models.IncidentStat{}).Select("zone_id, count(*) as count").Group("zone_id").Scan(&zoneRows)
	for _, r := range zoneRows {
		summary.ByZone[r.ZoneID] = r.Count
	}

	var avgSeconds *float64
	s.DB.Model(&models.IncidentStat{}).
		Select("AVG(TIMESTAMPDIFF(SECOND, incident_created_at, closed_at))").
		Where("closed_at IS NOT NULL").
		Scan(&avgSeconds)
	summary.AvgResolutionSeconds = avgSeconds

	return summary, nil
}

func (s *AnalyticsService) GetToday() (int64, error) {
	var count int64
	today := time.Now().Format("2006-01-02")
	err := s.DB.Model(&models.IncidentStat{}).
		Where("DATE(incident_created_at) = ?", today).
		Count(&count).Error
	return count, err
}

func (s *AnalyticsService) SaveAlert(alert models.CriticalAlert) error {
	return s.DB.Create(&alert).Error
}

func (s *AnalyticsService) GetAlerts() ([]models.CriticalAlert, error) {
	var alerts []models.CriticalAlert
	if err := s.DB.Order("created_at desc").Find(&alerts).Error; err != nil {
		return nil, err
	}
	return alerts, nil
}

// SaveAvailabilityAlert upserts the analytics copy of an availability alert on
// creation. It is idempotent per alert ID so a redelivered
// alert.availability_created message does not create a duplicate row
// (Requirement 7.4).
func (s *AnalyticsService) SaveAvailabilityAlert(alert models.AvailabilityAlert) error {
	if alert.Status == "" {
		alert.Status = models.AvailabilityAlertStatusOpen
	}
	now := time.Now()
	if alert.CreatedAt.IsZero() {
		alert.CreatedAt = now
	}
	alert.UpdatedAt = now

	return s.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "id"}},
		DoNothing: true,
	}).Create(&alert).Error
}

// AcknowledgeAvailabilityAlert records the acknowledged state for the analytics
// copy, keeping it in sync with the source-of-truth incident-service. A
// resolved alert is terminal and is never returned to the acknowledged state
// (Requirements 7.5, 7.6).
func (s *AnalyticsService) AcknowledgeAvailabilityAlert(id uuid.UUID, acknowledgedBy *uuid.UUID, acknowledgedAt time.Time) error {
	updates := map[string]interface{}{
		"status":          models.AvailabilityAlertStatusAcknowledged,
		"acknowledged_by": acknowledgedBy,
		"acknowledged_at": acknowledgedAt,
		"updated_at":      time.Now(),
	}
	return s.DB.Model(&models.AvailabilityAlert{}).
		Where("id = ? AND status <> ?", id, models.AvailabilityAlertStatusResolved).
		Updates(updates).Error
}

// ResolveAvailabilityAlert records the terminal resolved state for the
// analytics copy (Requirement 7.6).
func (s *AnalyticsService) ResolveAvailabilityAlert(id uuid.UUID, resolvedBy *uuid.UUID, resolvedAt time.Time) error {
	updates := map[string]interface{}{
		"status":      models.AvailabilityAlertStatusResolved,
		"resolved_by": resolvedBy,
		"resolved_at": resolvedAt,
		"updated_at":  time.Now(),
	}
	return s.DB.Model(&models.AvailabilityAlert{}).
		Where("id = ?", id).
		Updates(updates).Error
}

// GetAvailabilityAlerts returns the persisted availability alerts, newest first.
func (s *AnalyticsService) GetAvailabilityAlerts() ([]models.AvailabilityAlert, error) {
	var alerts []models.AvailabilityAlert
	if err := s.DB.Order("created_at desc").Find(&alerts).Error; err != nil {
		return nil, err
	}
	return alerts, nil
}