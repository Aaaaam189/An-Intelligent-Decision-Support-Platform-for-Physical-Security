package services

import (
	"errors"

	"gorm.io/gorm"

	"sentinelai/incident-service/dto"
	"sentinelai/incident-service/models"
)

// ErrRuleNotFound is returned when a rule cannot be located by id.
var ErrRuleNotFound = errors.New("rule not found")

type RuleService struct {
	DB *gorm.DB
}

func NewRuleService(db *gorm.DB) *RuleService {
	return &RuleService{DB: db}
}

// CreateRule validates the request at the service boundary, persists the rule
// (together with its SET-scoped target zones), and returns the created rule
// with its generated ID and target zones loaded. Invalid rules are rejected
// with a descriptive error and never persisted (Req 1.3, 1.8, 2.9).
func (s *RuleService) CreateRule(req dto.CreateRuleRequest) (*models.Rule, error) {
	if err := req.Validate(); err != nil {
		return nil, err
	}

	rule := dto.NewRuleFromCreateRequest(req)

	if err := s.DB.Create(&rule).Error; err != nil {
		return nil, errors.New("failed to create rule")
	}

	// Reload with target zones so the returned rule is complete.
	return s.GetRuleByID(rule.ID.String())
}

// GetAllRules returns every persisted rule with its conditions, outcome, and
// enabled state, including target zones (Req 1.7).
func (s *RuleService) GetAllRules() ([]models.Rule, error) {
	var rules []models.Rule
	if err := s.DB.Preload("TargetZones").Find(&rules).Error; err != nil {
		return nil, errors.New("failed to fetch rules")
	}
	return rules, nil
}

// GetEnabledRules returns all enabled rules with their target zones, used by
// the internal enabled-rules endpoint consumed by the decision-engine.
func (s *RuleService) GetEnabledRules() ([]models.Rule, error) {
	var rules []models.Rule
	if err := s.DB.Preload("TargetZones").Where("enabled = ?", true).Find(&rules).Error; err != nil {
		return nil, errors.New("failed to fetch enabled rules")
	}
	return rules, nil
}

// GetRuleByID fetches a single rule by id with its target zones loaded.
func (s *RuleService) GetRuleByID(id string) (*models.Rule, error) {
	var rule models.Rule
	if err := s.DB.Preload("TargetZones").Where("id = ?", id).First(&rule).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrRuleNotFound
		}
		return nil, errors.New("failed to fetch rule")
	}
	return &rule, nil
}

// UpdateRule applies a partial update, re-validates the merged rule, and
// persists it. When target zones are provided they replace the existing set
// wholesale: the old child rows are deleted and the new ones inserted within a
// single transaction. Invalid updates are rejected without persisting (Req 1.4,
// 1.8, 2.9).
func (s *RuleService) UpdateRule(id string, req dto.UpdateRuleRequest) (*models.Rule, error) {
	var rule models.Rule
	if err := s.DB.Preload("TargetZones").Where("id = ?", id).First(&rule).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrRuleNotFound
		}
		return nil, errors.New("failed to fetch rule")
	}

	// Track whether the caller supplied a new set of target zones so we know to
	// replace the child rows.
	zonesReplaced := req.TargetZones != nil

	dto.ApplyUpdateRequest(&rule, req)

	if err := dto.ValidateRule(rule); err != nil {
		return nil, err
	}

	err := s.DB.Transaction(func(tx *gorm.DB) error {
		if zonesReplaced {
			// Delete existing child rows before inserting the replacement set.
			if err := tx.Where("rule_id = ?", rule.ID).Delete(&models.RuleTargetZone{}).Error; err != nil {
				return err
			}
			// Ensure the new child rows are associated with this rule.
			for i := range rule.TargetZones {
				rule.TargetZones[i].RuleID = rule.ID
			}
		}
		// Persist scalar fields. Skip GORM's automatic association save so we
		// control child-row lifecycle explicitly.
		if err := tx.Omit("TargetZones").Save(&rule).Error; err != nil {
			return err
		}
		if zonesReplaced && len(rule.TargetZones) > 0 {
			if err := tx.Create(&rule.TargetZones).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, errors.New("failed to update rule")
	}

	// Reload with target zones so the returned rule reflects persisted state.
	return s.GetRuleByID(rule.ID.String())
}

// SetEnabled persists the enabled/disabled state of a rule (Req 1.5).
func (s *RuleService) SetEnabled(id string, enabled bool) (*models.Rule, error) {
	rule, err := s.GetRuleByID(id)
	if err != nil {
		return nil, err
	}

	if err := s.DB.Model(rule).Update("enabled", enabled).Error; err != nil {
		return nil, errors.New("failed to update rule state")
	}
	rule.Enabled = enabled
	return rule, nil
}

// DeleteRule removes a rule from persistent storage. The rule_target_zones
// child rows are removed via the ON DELETE CASCADE constraint (Req 1.6).
func (s *RuleService) DeleteRule(id string) error {
	result := s.DB.Delete(&models.Rule{}, "id = ?", id)
	if result.Error != nil {
		return errors.New("failed to delete rule")
	}
	if result.RowsAffected == 0 {
		return ErrRuleNotFound
	}
	return nil
}
