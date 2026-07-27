package services

import (
	"time"

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