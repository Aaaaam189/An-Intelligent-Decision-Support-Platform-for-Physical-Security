package services

import (
	"errors"

	"gorm.io/gorm"

	"sentinelai/incident-service/dto"
	"sentinelai/incident-service/models"
)

type ShiftService struct {
	DB *gorm.DB
}

func NewShiftService(db *gorm.DB) *ShiftService {
	return &ShiftService{DB: db}
}

func (s *ShiftService) CreateShift(req dto.CreateShiftRequest) (*models.Shift, error) {
	if !req.EndTime.After(req.StartTime) {
		return nil, errors.New("endTime must be after startTime")
	}

	shift := models.Shift{
		GuardID:   req.GuardID,
		ZoneID:    req.ZoneID,
		StartTime: req.StartTime,
		EndTime:   req.EndTime,
	}

	if err := s.DB.Create(&shift).Error; err != nil {
		return nil, errors.New("failed to create shift")
	}
	return &shift, nil
}

func (s *ShiftService) GetAllShifts() ([]models.Shift, error) {
	var shifts []models.Shift
	if err := s.DB.Find(&shifts).Error; err != nil {
		return nil, errors.New("failed to fetch shifts")
	}
	return shifts, nil
}

func (s *ShiftService) GetShiftsByGuard(guardID string) ([]models.Shift, error) {
	var shifts []models.Shift
	if err := s.DB.Where("guard_id = ?", guardID).Find(&shifts).Error; err != nil {
		return nil, errors.New("failed to fetch shifts")
	}
	return shifts, nil
}

func (s *ShiftService) GetShiftByID(id string) (*models.Shift, error) {
	var shift models.Shift
	if err := s.DB.Where("id = ?", id).First(&shift).Error; err != nil {
		return nil, errors.New("shift not found")
	}
	return &shift, nil
}

func (s *ShiftService) UpdateShift(id string, req dto.UpdateShiftRequest) (*models.Shift, error) {
	var shift models.Shift
	if err := s.DB.Where("id = ?", id).First(&shift).Error; err != nil {
		return nil, errors.New("shift not found")
	}

	if req.ZoneID != nil {
		shift.ZoneID = *req.ZoneID
	}
	if req.StartTime != nil {
		shift.StartTime = *req.StartTime
	}
	if req.EndTime != nil {
		shift.EndTime = *req.EndTime
	}

	if err := s.DB.Save(&shift).Error; err != nil {
		return nil, errors.New("failed to update shift")
	}
	return &shift, nil
}

func (s *ShiftService) DeleteShift(id string) error {
	result := s.DB.Delete(&models.Shift{}, "id = ?", id)
	if result.RowsAffected == 0 {
		return errors.New("shift not found")
	}
	return result.Error
}