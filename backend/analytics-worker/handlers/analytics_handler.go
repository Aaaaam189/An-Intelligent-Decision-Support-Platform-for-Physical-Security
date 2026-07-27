package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"sentinelai/analytics-worker/services"
)

type AnalyticsHandler struct {
	Service *services.AnalyticsService
}

func NewAnalyticsHandler(s *services.AnalyticsService) *AnalyticsHandler {
	return &AnalyticsHandler{Service: s}
}

func (h *AnalyticsHandler) GetSummary(c *gin.Context) {
	summary, err := h.Service.GetSummary()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, summary)
}

func (h *AnalyticsHandler) GetToday(c *gin.Context) {
	count, err := h.Service.GetToday()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"incidentsToday": count})
}

func (h *AnalyticsHandler) GetAlerts(c *gin.Context) {
	alerts, err := h.Service.GetAlerts()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, alerts)
}