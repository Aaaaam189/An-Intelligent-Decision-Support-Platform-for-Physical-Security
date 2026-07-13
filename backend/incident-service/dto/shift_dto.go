package dto

import (
	"time"

	"github.com/google/uuid"
)

type CreateShiftRequest struct {
	GuardID   uuid.UUID `json:"guardId" binding:"required"`
	ZoneID    uuid.UUID `json:"zoneId" binding:"required"`
	StartTime time.Time `json:"startTime" binding:"required"`
	EndTime   time.Time `json:"endTime" binding:"required"`
}

type UpdateShiftRequest struct {
	ZoneID    *uuid.UUID `json:"zoneId,omitempty"`
	StartTime *time.Time `json:"startTime,omitempty"`
	EndTime   *time.Time `json:"endTime,omitempty"`
}

type ShiftResponse struct {
	ID        uuid.UUID `json:"id"`
	GuardID   uuid.UUID `json:"guardId"`
	ZoneID    uuid.UUID `json:"zoneId"`
	StartTime time.Time `json:"startTime"`
	EndTime   time.Time `json:"endTime"`
}