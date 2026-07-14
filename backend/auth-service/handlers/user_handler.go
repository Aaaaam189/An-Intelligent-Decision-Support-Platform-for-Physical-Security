package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"sentinelai/auth-service/dto"
	"sentinelai/auth-service/services"
)

type UserHandler struct {
	Service *services.UserService
}

func NewUserHandler(s *services.UserService) *UserHandler {
	return &UserHandler{Service: s}
}

func (h *UserHandler) CreateUser(c *gin.Context) {
	var req dto.CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.Service.CreateUser(req)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, dto.ToUserResponse(*user))
}

func (h *UserHandler) DeleteUser(c *gin.Context) {
	id := c.Param("id")
	if err := h.Service.DeleteUser(id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "user deleted"})
}

func (h *UserHandler) GetAllUsers(c *gin.Context) {
	users, err := h.Service.GetAllUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	response := make([]dto.UserResponse, 0, len(users))
	for _, u := range users {
		response = append(response, dto.ToUserResponse(u))
	}
	c.JSON(http.StatusOK, response)
}

func (h *UserHandler) GetUserByID(c *gin.Context) {
	user, err := h.Service.GetUserByID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, dto.ToUserResponse(*user))
}

func (h *UserHandler) UpdateUser(c *gin.Context) {
	var req dto.UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.Service.UpdateUser(c.Param("id"), req)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, dto.ToUserResponse(*user))
}

func (h *UserHandler) GetActiveUsers(c *gin.Context) {
	users, err := h.Service.GetActiveUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	response := make([]dto.UserResponse, 0, len(users))
	for _, u := range users {
		response = append(response, dto.ToUserResponse(u))
	}
	c.JSON(http.StatusOK, response)
}

func (h *UserHandler) GetInactiveUsers(c *gin.Context) {
	users, err := h.Service.GetInactiveUsers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	response := make([]dto.UserResponse, 0, len(users))
	for _, u := range users {
		response = append(response, dto.ToUserResponse(u))
	}
	c.JSON(http.StatusOK, response)
}

func (h *UserHandler) DeactivateUser(c *gin.Context) {
	var req dto.DeactivateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.Service.DeactivateUser(c.Param("id"), req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, dto.ToUserResponse(*user))
}

func (h *UserHandler) ReactivateUser(c *gin.Context) {
	user, err := h.Service.ReactivateUser(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, dto.ToUserResponse(*user))
}