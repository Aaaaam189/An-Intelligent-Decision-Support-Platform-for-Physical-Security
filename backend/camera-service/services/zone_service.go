package services

import (
	"errors"

	"gorm.io/gorm"

	"sentinelai/camera-service/dto"
	"sentinelai/camera-service/models"
)

type ZoneService struct {
	DB *gorm.DB
}

func NewZoneService(db *gorm.DB) *ZoneService {
	return &ZoneService{DB: db}
}

func (s *ZoneService) CreateZone(req dto.CreateZoneRequest) (*models.Zone, error) {
	zone := models.Zone{Name: req.Name}

	if err := s.DB.Create(&zone).Error; err != nil {
		return nil, errors.New("failed to create zone")
	}

	return &zone, nil
}

func (s *ZoneService) GetAllZones() ([]models.Zone, error) {
	var zones []models.Zone
	if err := s.DB.Find(&zones).Error; err != nil {
		return nil, errors.New("failed to fetch zones")
	}
	return zones, nil
}

func (s *ZoneService) GetZoneByID(id string) (*models.Zone, error) {
	var zone models.Zone
	if err := s.DB.Where("id = ?", id).First(&zone).Error; err != nil {
		return nil, errors.New("zone not found")
	}
	return &zone, nil
}

func (s *ZoneService) UpdateZone(id string, req dto.UpdateZoneRequest) (*models.Zone, error) {
	var zone models.Zone
	if err := s.DB.Where("id = ?", id).First(&zone).Error; err != nil {
		return nil, errors.New("zone not found")
	}

	if req.Name != nil {
		zone.Name = *req.Name
	}

	if err := s.DB.Save(&zone).Error; err != nil {
		return nil, errors.New("failed to update zone")
	}

	return &zone, nil
}

func (s *ZoneService) DeleteZone(id string) error {
	result := s.DB.Delete(&models.Zone{}, "id = ?", id)
	if result.RowsAffected == 0 {
		return errors.New("zone not found")
	}
	return result.Error
}