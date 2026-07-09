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
	Active   *bool           `json:"active,omitempty"`
}

type UserResponse struct {
	ID        uuid.UUID      `json:"id"`
	FullName  string         `json:"fullName"`
	Email     string         `json:"email"`
	Role      models.AppRole `json:"role"`
	CreatedAt time.Time      `json:"createdAt"`
}

func ToUserResponse(u models.User) UserResponse {
	return UserResponse{
		ID:        u.ID,
		FullName:  u.FullName,
		Email:     u.Email,
		Role:      u.Role,
		CreatedAt: u.CreatedAt,
	}
}