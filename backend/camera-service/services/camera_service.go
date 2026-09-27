package services

import (
	"errors"

	"gorm.io/gorm"

	"sentinelai/camera-service/dto"
	"sentinelai/camera-service/models"
)

type CameraService struct {
	DB *gorm.DB
}

func NewCameraService(db *gorm.DB) *CameraService {
	return &CameraService{DB: db}
}

func (s *CameraService) CreateCamera(req dto.CreateCameraRequest) (*models.Camera, error) {
	var zone models.Zone
	if err := s.DB.Where("id = ?", req.ZoneID).First(&zone).Error; err != nil {
		return nil, errors.New("zone does not exist")
	}

	camera := models.Camera{
		Name:      req.Name,
		ZoneID:    req.ZoneID,
		Location:  req.Location,
		StreamURL: req.StreamURL,
		IsActive:  true,
	}

	if err := s.DB.Create(&camera).Error; err != nil {
		return nil, errors.New("failed to create camera")
	}

	return &camera, nil
}

func (s *CameraService) GetAllCameras() ([]models.Camera, error) {
	var cameras []models.Camera
	if err := s.DB.Find(&cameras).Error; err != nil {
		return nil, errors.New("failed to fetch cameras")
	}
	return cameras, nil
}

// GetActiveCameras returns only cameras whose IsActive flag is set. The
// ai-service polls this (via the internal endpoint) to know which camera
// feeds it should be streaming and running detection on.
func (s *CameraService) GetActiveCameras() ([]models.Camera, error) {
	var cameras []models.Camera
	if err := s.DB.Where("is_active = ?", true).Find(&cameras).Error; err != nil {
		return nil, errors.New("failed to fetch active cameras")
	}
	return cameras, nil
}

func (s *CameraService) GetCameraByID(id string) (*models.Camera, error) {
	var camera models.Camera
	if err := s.DB.Where("id = ?", id).First(&camera).Error; err != nil {
		return nil, errors.New("camera not found")
	}
	return &camera, nil
}

func (s *CameraService) UpdateCamera(id string, req dto.UpdateCameraRequest) (*models.Camera, error) {
	var camera models.Camera
	if err := s.DB.Where("id = ?", id).First(&camera).Error; err != nil {
		return nil, errors.New("camera not found")
	}

	if req.Name != nil {
		camera.Name = *req.Name
	}
	if req.ZoneID != nil {
		camera.ZoneID = *req.ZoneID
	}
	if req.Location != nil {
		camera.Location = *req.Location
	}
	if req.IsActive != nil {
		camera.IsActive = *req.IsActive
	}
	if req.StreamURL != nil {
		camera.StreamURL = *req.StreamURL
	}

	if err := s.DB.Save(&camera).Error; err != nil {
		return nil, errors.New("failed to update camera")
	}

	return &camera, nil
}

func (s *CameraService) DeleteCamera(id string) error {
	result := s.DB.Delete(&models.Camera{}, "id = ?", id)
	if result.RowsAffected == 0 {
		return errors.New("camera not found")
	}
	return result.Error
}