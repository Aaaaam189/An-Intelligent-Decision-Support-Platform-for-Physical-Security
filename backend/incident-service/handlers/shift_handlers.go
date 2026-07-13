package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"sentinelai/incident-service/dto"
	"sentinelai/incident-service/services"
)

type ShiftHandler struct {
	Service *services.ShiftService
}

func NewShiftHandler(s *services.ShiftService) *ShiftHandler {
	return &ShiftHandler{Service: s}
}

func (h *ShiftHandler) CreateShift(c *gin.Context) {
	var req dto.CreateShiftRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	shift, err := h.Service.CreateShift(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, dto.ToShiftResponse(*shift))
}

func (h *ShiftHandler) GetAllShifts(c *gin.Context) {
	shifts, err := h.Service.GetAllShifts()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	response := make([]dto.ShiftResponse, 0, len(shifts))
	for _, s := range shifts {
		response = append(response, dto.ToShiftResponse(s))
	}
	c.JSON(http.StatusOK, response)
}

// GetMyShifts reads the guard's own id from the JWT — not from the
// URL — so a guard can only ever see their own schedule this way.
func (h *ShiftHandler) GetMyShifts(c *gin.Context) {
	userID, _ := c.Get("userId")

	shifts, err := h.Service.GetShiftsByGuard(userID.(string))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	response := make([]dto.ShiftResponse, 0, len(shifts))
	for _, s := range shifts {
		response = append(response, dto.ToShiftResponse(s))
	}
	c.JSON(http.StatusOK, response)
}

func (h *ShiftHandler) GetShiftByID(c *gin.Context) {
	shift, err := h.Service.GetShiftByID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, dto.ToShiftResponse(*shift))
}

func (h *ShiftHandler) UpdateShift(c *gin.Context) {
	var req dto.UpdateShiftRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	shift, err := h.Service.UpdateShift(c.Param("id"), req)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, dto.ToShiftResponse(*shift))
}

func (h *ShiftHandler) DeleteShift(c *gin.Context) {
	if err := h.Service.DeleteShift(c.Param("id")); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "shift deleted"})
}