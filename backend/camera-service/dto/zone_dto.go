package dto

import "github.com/google/uuid"

type CreateZoneRequest struct {
	Name string `json:"name" binding:"required"`
}

type UpdateZoneRequest struct {
	Name *string `json:"name,omitempty"`
}

type ZoneResponse struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
}