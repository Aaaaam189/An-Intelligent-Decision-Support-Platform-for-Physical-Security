package models

import "time"

// DetectionEvent is the shape ai-service will eventually publish.
// Metadata is a flexible bag for anything specific to the event type —
// e.g. a crowd count number, a face-match confidence score.
type DetectionEvent struct {
	CameraID  string                 `json:"cameraId"`
	ZoneID    string                 `json:"zoneId"`
	Type      string                 `json:"type"` // PERSON_DETECTED, CROWD_COUNT, FACE_MATCH_MULTI_CAMERA
	Timestamp time.Time              `json:"timestamp"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}