package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"sentinelai/camera-service/dto"
	"sentinelai/camera-service/services"
)

type ZoneHandler struct {
	Service *services.ZoneService
}

func NewZoneHandler(s *services.ZoneService) *ZoneHandler {
	return &ZoneHandler{Service: s}
}

func (h *ZoneHandler) CreateZone(c *gin.Context) {
	var req dto.CreateZoneRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	zone, err := h.Service.CreateZone(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, dto.ToZoneResponse(*zone))
}

func (h *ZoneHandler) GetAllZones(c *gin.Context) {
	zones, err := h.Service.GetAllZones()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	response := make([]dto.ZoneResponse, 0, len(zones))
	for _, z := range zones {
		response = append(response, dto.ToZoneResponse(z))
	}

	c.JSON(http.StatusOK, response)
}

func (h *ZoneHandler) GetZoneByID(c *gin.Context) {
	id := c.Param("id")

	zone, err := h.Service.GetZoneByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, dto.ToZoneResponse(*zone))
}

func (h *ZoneHandler) UpdateZone(c *gin.Context) {
	id := c.Param("id")

	var req dto.UpdateZoneRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	zone, err := h.Service.UpdateZone(id, req)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, dto.ToZoneResponse(*zone))
}

func (h *ZoneHandler) DeleteZone(c *gin.Context) {
	id := c.Param("id")

	if err := h.Service.DeleteZone(id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "zone deleted"})
}