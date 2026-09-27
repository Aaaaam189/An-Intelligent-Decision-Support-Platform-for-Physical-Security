package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"sentinelai/camera-service/dto"
	"sentinelai/camera-service/services"
)

type CameraHandler struct {
	Service *services.CameraService
}

func NewCameraHandler(s *services.CameraService) *CameraHandler {
	return &CameraHandler{Service: s}
}

func (h *CameraHandler) CreateCamera(c *gin.Context) {
	var req dto.CreateCameraRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	camera, err := h.Service.CreateCamera(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, dto.ToCameraResponse(*camera))
}

func (h *CameraHandler) GetAllCameras(c *gin.Context) {
	cameras, err := h.Service.GetAllCameras()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	response := make([]dto.CameraResponse, 0, len(cameras))
	for _, cam := range cameras {
		response = append(response, dto.ToCameraResponse(cam))
	}

	c.JSON(http.StatusOK, response)
}

// GetActiveCamerasInternal is the internal, service-to-service endpoint the
// ai-service polls to discover which cameras it should stream. It returns
// only active cameras with their streamUrl and zoneId, so the ai-service can
// open each feed and tag detections with the right camera/zone.
func (h *CameraHandler) GetActiveCamerasInternal(c *gin.Context) {
	cameras, err := h.Service.GetActiveCameras()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	response := make([]dto.CameraResponse, 0, len(cameras))
	for _, cam := range cameras {
		response = append(response, dto.ToCameraResponse(cam))
	}

	c.JSON(http.StatusOK, response)
}

func (h *CameraHandler) GetCameraByID(c *gin.Context) {
	id := c.Param("id")

	camera, err := h.Service.GetCameraByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, dto.ToCameraResponse(*camera))
}

func (h *CameraHandler) UpdateCamera(c *gin.Context) {
	id := c.Param("id")

	var req dto.UpdateCameraRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	camera, err := h.Service.UpdateCamera(id, req)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, dto.ToCameraResponse(*camera))
}

func (h *CameraHandler) DeleteCamera(c *gin.Context) {
	id := c.Param("id")

	if err := h.Service.DeleteCamera(id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "camera deleted"})
}