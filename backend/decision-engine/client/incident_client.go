package client

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"sentinelai/decision-engine/models"
	"sentinelai/decision-engine/rules"
	"sentinelai/shared/internalauth"
)

type IncidentClient struct {
	BaseURL     string
	InternalKey string
}

func NewIncidentClient(baseURL, internalKey string) *IncidentClient {
	return &IncidentClient{BaseURL: baseURL, InternalKey: internalKey}
}

type createIncidentPayload struct {
	CameraID  string  `json:"cameraId"`
	ZoneID    string  `json:"zoneId"`
	Type      string  `json:"type"`
	Priority  string  `json:"priority"`
	RiskScore float64 `json:"riskScore"`
}

func (c *IncidentClient) CreateIncident(event models.DetectionEvent, decision rules.Decision) error {
	payload := createIncidentPayload{
		CameraID:  event.CameraID,
		ZoneID:    event.ZoneID,
		Type:      decision.IncidentType,
		Priority:  decision.Priority,
		RiskScore: decision.RiskScore,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	// Note the path: /internal/incidents, not /incidents — this hits
	// the new internal-only route group.
	req, err := http.NewRequest(http.MethodPost, c.BaseURL+"/internal/incidents", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	internalauth.AttachInternalKey(req, c.InternalKey)

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("incident-service returned status %d", resp.StatusCode)
	}

	return nil
}