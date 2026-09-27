package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"sentinelai/incident-service/dto"
	"sentinelai/incident-service/services"
)

type RuleHandler struct {
	Service *services.RuleService
}

func NewRuleHandler(s *services.RuleService) *RuleHandler {
	return &RuleHandler{Service: s}
}

func (h *RuleHandler) CreateRule(c *gin.Context) {
	var req dto.CreateRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	rule, err := h.Service.CreateRule(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, dto.ToRuleResponse(*rule))
}

func (h *RuleHandler) GetAllRules(c *gin.Context) {
	rules, err := h.Service.GetAllRules()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	response := make([]dto.RuleResponse, 0, len(rules))
	for _, r := range rules {
		response = append(response, dto.ToRuleResponse(r))
	}
	c.JSON(http.StatusOK, response)
}

func (h *RuleHandler) GetRuleByID(c *gin.Context) {
	rule, err := h.Service.GetRuleByID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, dto.ToRuleResponse(*rule))
}

func (h *RuleHandler) UpdateRule(c *gin.Context) {
	var req dto.UpdateRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	rule, err := h.Service.UpdateRule(c.Param("id"), req)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, dto.ToRuleResponse(*rule))
}

// SetEnabled toggles a rule's enabled/disabled state (Req 1.5). It expects a
// body of the form {"enabled": bool} and persists the new state.
func (h *RuleHandler) SetEnabled(c *gin.Context) {
	var req dto.SetRuleEnabledRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	rule, err := h.Service.SetEnabled(c.Param("id"), *req.Enabled)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, dto.ToRuleResponse(*rule))
}

func (h *RuleHandler) DeleteRule(c *gin.Context) {
	if err := h.Service.DeleteRule(c.Param("id")); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "rule deleted"})
}

// GetEnabledRules is the internal, service-to-service endpoint the
// decision-engine polls to refresh its rule cache. It returns only enabled
// rules with their conditions, outcome, and target zones.
func (h *RuleHandler) GetEnabledRules(c *gin.Context) {
	rules, err := h.Service.GetEnabledRules()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	response := make([]dto.RuleResponse, 0, len(rules))
	for _, r := range rules {
		response = append(response, dto.ToRuleResponse(r))
	}
	c.JSON(http.StatusOK, response)
}