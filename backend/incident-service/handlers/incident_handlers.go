package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"sentinelai/incident-service/dto"
	"sentinelai/incident-service/models"
	"sentinelai/incident-service/services"
)

type IncidentHandler struct {
	Service *services.IncidentService
}

func NewIncidentHandler(s *services.IncidentService) *IncidentHandler {
	return &IncidentHandler{Service: s}
}

// CreateIncident is meant to be called by decision-engine once that
// service exists. Exposed here as admin-only for now, purely so the
// assignment algorithm can be tested end to end before decision-engine
// is built.
func (h *IncidentHandler) CreateIncident(c *gin.Context) {
	var req dto.CreateIncidentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	incident, err := h.Service.CreateIncident(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, dto.ToIncidentResponse(*incident))
}

func (h *IncidentHandler) GetAllIncidents(c *gin.Context) {
	incidents, err := h.Service.GetAllIncidents()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	response := make([]dto.IncidentResponse, 0, len(incidents))
	for _, i := range incidents {
		response = append(response, dto.ToIncidentResponse(i))
	}
	c.JSON(http.StatusOK, response)
}

func (h *IncidentHandler) GetIncidentByID(c *gin.Context) {
	incident, err := h.Service.GetIncidentByID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, dto.ToIncidentResponse(*incident))
}

func (h *IncidentHandler) UpdateStatus(c *gin.Context) {
	userID, _ := c.Get("userId")
	roleVal, _ := c.Get("role")
	role := models.AppRole(roleVal.(string))

	var req dto.UpdateIncidentStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	incident, err := h.Service.UpdateStatus(c.Param("id"), userID.(string), role, req)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, dto.ToIncidentResponse(*incident))
}

func (h *IncidentHandler) Reassign(c *gin.Context) {
	var req dto.ReassignIncidentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	incident, err := h.Service.Reassign(c.Param("id"), req)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, dto.ToIncidentResponse(*incident))
}