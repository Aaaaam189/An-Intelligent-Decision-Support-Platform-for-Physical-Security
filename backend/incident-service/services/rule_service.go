package services

import (
	"errors"

	"gorm.io/gorm"

	"sentinelai/incident-service/dto"
	"sentinelai/incident-service/models"
)

type RuleService struct {
	DB *gorm.DB
}

func NewRuleService(db *gorm.DB) *RuleService {
	return &RuleService{DB: db}
}

func (s *RuleService) CreateRule(req dto.CreateRuleRequest) (*models.Rule, error) {
	rule := models.Rule{
		Name:              req.Name,
		Condition:         req.Condition,
		ResultingPriority: req.ResultingPriority,
	}

	if err := s.DB.Create(&rule).Error; err != nil {
		return nil, errors.New("failed to create rule")
	}
	return &rule, nil
}

func (s *RuleService) GetAllRules() ([]models.Rule, error) {
	var rules []models.Rule
	if err := s.DB.Find(&rules).Error; err != nil {
		return nil, errors.New("failed to fetch rules")
	}
	return rules, nil
}

func (s *RuleService) GetRuleByID(id string) (*models.Rule, error) {
	var rule models.Rule
	if err := s.DB.Where("id = ?", id).First(&rule).Error; err != nil {
		return nil, errors.New("rule not found")
	}
	return &rule, nil
}

func (s *RuleService) UpdateRule(id string, req dto.UpdateRuleRequest) (*models.Rule, error) {
	var rule models.Rule
	if err := s.DB.Where("id = ?", id).First(&rule).Error; err != nil {
		return nil, errors.New("rule not found")
	}

	if req.Name != nil {
		rule.Name = *req.Name
	}
	if req.Condition != nil {
		rule.Condition = *req.Condition
	}
	if req.ResultingPriority != nil {
		rule.ResultingPriority = *req.ResultingPriority
	}

	if err := s.DB.Save(&rule).Error; err != nil {
		return nil, errors.New("failed to update rule")
	}
	return &rule, nil
}

func (s *RuleService) DeleteRule(id string) error {
	result := s.DB.Delete(&models.Rule{}, "id = ?", id)
	if result.RowsAffected == 0 {
		return errors.New("rule not found")
	}
	return result.Error
}