package dto

import (
	"time"

	"github.com/google/uuid"
	"sentinelai/auth-service/models"
)

type CreateUserRequest struct {
	FullName string         `json:"fullName" binding:"required"`
	Email    string         `json:"email" binding:"required,email"`
	Password string         `json:"password" binding:"required,min=8"`
	Role     models.AppRole `json:"role" binding:"required,oneof=ADMIN SECURITY_GUARD"`
}

type UpdateUserRequest struct {
	FullName *string         `json:"fullName,omitempty"`
	Role     *models.AppRole `json:"role,omitempty"`
	IsActive *bool           `json:"isActive,omitempty"`
}

type DeactivateUserRequest struct {
	ReactivateAt *time.Time `json:"reactivateAt,omitempty"`
}

type UserResponse struct {
	ID           uuid.UUID      `json:"id"`
	FullName     string         `json:"fullName"`
	Email        string         `json:"email"`
	Role         models.AppRole `json:"role"`
	IsActive     bool           `json:"isActive"`
	ReactivateAt *time.Time     `json:"reactivateAt"`
	CreatedAt    time.Time      `json:"createdAt"`
}

func ToUserResponse(u models.User) UserResponse {
	return UserResponse{
		ID:           u.ID,
		FullName:     u.FullName,
		Email:        u.Email,
		Role:         u.Role,
		IsActive:     u.IsActive,
		ReactivateAt: u.ReactivateAt,
		CreatedAt:    u.CreatedAt,
	}
}