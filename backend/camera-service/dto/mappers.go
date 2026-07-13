package dto

import "sentinelai/camera-service/models"

func ToCameraResponse(c models.Camera) CameraResponse {
	return CameraResponse{
		ID:        c.ID,
		Name:      c.Name,
		ZoneID:    c.ZoneID,
		Location:  c.Location,
		IsActive:  c.IsActive,
		StreamURL: c.StreamURL,
		CreatedAt: c.CreatedAt,
	}
}

func ToZoneResponse(z models.Zone) ZoneResponse {
	return ZoneResponse{
		ID:   z.ID,
		Name: z.Name,
	}
}