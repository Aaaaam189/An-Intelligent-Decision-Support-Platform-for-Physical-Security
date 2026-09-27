package client

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"sentinelai/decision-engine/models"
	"sentinelai/decision-engine/rules"
	"sentinelai/shared/internalauth"
)

// ErrRetriesExhausted is returned by CreateIncident when every attempt in the
// bounded backoff loop fails. It is distinct from a transient per-attempt
// error so the consumer can tell a definitively-failed creation (route to the
// dead-letter destination) apart from an in-progress retry (Requirements 3.9,
// 3.12). Callers should use errors.Is to detect it.
var ErrRetriesExhausted = errors.New("incident creation failed after exhausting retries")

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
	RuleID    string  `json:"ruleId,omitempty"`
}

// CreateIncident posts an incident to incident-service, retrying on failure
// with bounded exponential backoff. It makes up to MaxRetryAttempts attempts;
// each attempt uses its own 5s HTTP timeout, and the delay before attempt n is
// governed by backoffDelay (1s doubling to a 30s cap). The resulting priority
// and the matched rule ID from the decision are included in the payload
// (Requirements 3.4, 3.9, 9.2).
//
// On success it returns nil. If every attempt fails, it returns an error that
// wraps ErrRetriesExhausted (detectable via errors.Is) along with the last
// underlying failure, so the caller can route the message to the dead-letter
// destination.
func (c *IncidentClient) CreateIncident(event models.DetectionEvent, decision rules.Decision) error {
	payload := createIncidentPayload{
		CameraID:  event.CameraID,
		ZoneID:    event.ZoneID,
		Type:      decision.IncidentType,
		Priority:  decision.Priority,
		RiskScore: decision.RiskScore,
		RuleID:    decision.RuleID,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	var lastErr error
	for attempt := 1; attempt <= MaxRetryAttempts; attempt++ {
		if attempt > 1 {
			// Wait before this retry; the delay before attempt n is
			// backoffDelay(n-1) so the schedule is 1s, 2s, 4s, 8s between
			// attempts 1..5 (Requirement 3.9).
			time.Sleep(backoffDelay(attempt - 1))
		}

		if err := c.doCreate(body); err != nil {
			lastErr = err
			continue
		}

		return nil
	}

	return fmt.Errorf("%w: %v", ErrRetriesExhausted, lastErr)
}

// doCreate performs a single incident-creation HTTP attempt with a 5s timeout.
// It returns a non-nil error when the request fails or incident-service
// responds with a status other than 201 Created.
func (c *IncidentClient) doCreate(body []byte) error {
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
