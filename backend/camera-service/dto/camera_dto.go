package dto

import (
	"time"

	"github.com/google/uuid"
)

type CreateCameraRequest struct {
	Name      string    `json:"name" binding:"required"`
	ZoneID    uuid.UUID `json:"zoneId" binding:"required"`
	Location  string    `json:"location" binding:"required"`
	StreamURL string    `json:"streamUrl" binding:"required"`
}


type UpdateCameraRequest struct {
	Name      *string    `json:"name,omitempty"`
	ZoneID    *uuid.UUID `json:"zoneId,omitempty"`
	Location  *string    `json:"location,omitempty"`
	IsActive  *bool      `json:"isActive,omitempty"`
	StreamURL *string    `json:"streamUrl,omitempty"`
}

type CameraResponse struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	ZoneID    uuid.UUID `json:"zoneId"`
	Location  string    `json:"location"`
	IsActive  bool      `json:"isActive"`
	StreamURL string    `json:"streamUrl"`
	CreatedAt time.Time `json:"createdAt"`
}