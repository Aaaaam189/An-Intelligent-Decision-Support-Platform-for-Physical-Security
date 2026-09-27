package handlers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"sentinelai/incident-service/services"
	"sentinelai/shared/rabbitmq"
)

// AvailabilityHandler groups the assistance-request and availability-alert
// HTTP handlers (Requirements 6.1, 7.5, 7.6).
//
// Assistance requests are recorded through the IncidentService (which enforces
// that the caller is the assigned guard). Availability-alert listing goes
// through the AvailabilityAlertService, while acknowledge/resolve use the
// package-level lifecycle state machine operating directly on the DB.
type AvailabilityHandler struct {
	IncidentService *services.IncidentService
	AlertService    *services.AvailabilityAlertService
}

func NewAvailabilityHandler(incidentService *services.IncidentService, alertService *services.AvailabilityAlertService) *AvailabilityHandler {
	return &AvailabilityHandler{
		IncidentService: incidentService,
		AlertService:    alertService,
	}
}

// authenticatedUserID extracts the authenticated user's UUID from the gin
// context. AuthMiddleware stores the raw JWT claim (a string) under "userId".
func authenticatedUserID(c *gin.Context) (uuid.UUID, error) {
	raw, exists := c.Get("userId")
	if !exists {
		return uuid.Nil, errors.New("missing authenticated user")
	}
	str, ok := raw.(string)
	if !ok {
		return uuid.Nil, errors.New("invalid authenticated user")
	}
	id, err := uuid.Parse(str)
	if err != nil {
		return uuid.Nil, errors.New("invalid authenticated user id")
	}
	return id, nil
}

// RequestAssistance handles POST /incidents/:id/assistance. The caller must be
// the guard currently assigned to the incident; enforcement lives in the
// service (RecordAssistanceRequest), which leaves the incident unchanged and
// returns an error if the request cannot be recorded (Requirements 6.1, 6.2).
func (h *AvailabilityHandler) RequestAssistance(c *gin.Context) {
	guardID, err := authenticatedUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	result, err := h.IncidentService.RecordAssistanceRequest(c.Param("id"), guardID)
	if err != nil {
		// The service enforces "only the assigned guard can request
		// assistance" and "incident not found"; treat both as client errors
		// so a guard learns they are not authorised for this incident.
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}

	// Notify the available guards the service selected (Requirement 6.3). The
	// notification-worker delivers notification.assistance to each guard in
	// recipientGuardIds. Publishing here keeps the assistance-request
	// recording transaction (in the service) free of side effects.
	h.publishAssistance(result, guardID)

	c.JSON(http.StatusCreated, gin.H{
		"assistanceRequest": result.Request,
		"recipients":        result.Recipients,
	})
}

// publishAssistance emits notification.assistance carrying the incident id, the
// requesting guard, and the recipient guard ids so the notification-worker can
// deliver to exactly the available guards (Requirement 6.3).
func (h *AvailabilityHandler) publishAssistance(result *services.AssistanceResult, requestingGuardID uuid.UUID) {
	if h.AlertService == nil || h.AlertService.Channel == nil {
		return
	}
	if len(result.Recipients) == 0 {
		return
	}
	recipients := make([]string, 0, len(result.Recipients))
	for _, id := range result.Recipients {
		recipients = append(recipients, id.String())
	}
	payload := map[string]interface{}{
		"incidentId":          result.Request.IncidentID,
		"assistanceRequestId": result.Request.ID,
		"requestingGuardId":   requestingGuardID,
		"recipientGuardIds":   recipients,
		"createdAt":           result.Request.CreatedAt,
	}
	_ = rabbitmq.Publish(h.AlertService.Channel, h.AlertService.ExchangeName, "notification.assistance", payload)
}

// ListAvailabilityAlerts handles GET /availability-alerts, returning all
// availability alerts most-recent-first (admin/supervisor only, enforced by
// the route guard).
func (h *AvailabilityHandler) ListAvailabilityAlerts(c *gin.Context) {
	alerts, err := h.AlertService.ListAvailabilityAlerts()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, alerts)
}

// AcknowledgeAvailabilityAlert handles PATCH /availability-alerts/:id/acknowledge,
// recording the acknowledging user and timestamp when the alert is not already
// resolved (Requirement 7.5).
func (h *AvailabilityHandler) AcknowledgeAvailabilityAlert(c *gin.Context) {
	userID, err := authenticatedUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	alertID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid alert id"})
		return
	}

	alert, err := services.AcknowledgeAvailabilityAlert(h.AlertService.DB, alertID, userID)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrAvailabilityAlertNotFound):
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		case errors.Is(err, services.ErrAvailabilityAlertResolved):
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return
	}

	// Sync the analytics-worker copy of the alert (Requirements 7.4, 7.5).
	h.AlertService.PublishAvailabilityAcknowledged(*alert)

	c.JSON(http.StatusOK, alert)
}

// ResolveAvailabilityAlert handles PATCH /availability-alerts/:id/resolve,
// recording the resolving user and timestamp. Resolve is terminal and
// mutually exclusive with the acknowledged state (Requirement 7.6).
func (h *AvailabilityHandler) ResolveAvailabilityAlert(c *gin.Context) {
	userID, err := authenticatedUserID(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	alertID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid alert id"})
		return
	}

	alert, err := services.ResolveAvailabilityAlert(h.AlertService.DB, alertID, userID)
	if err != nil {
		if errors.Is(err, services.ErrAvailabilityAlertNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Sync the analytics-worker copy of the alert (Requirements 7.4, 7.6).
	h.AlertService.PublishAvailabilityResolved(*alert)

	c.JSON(http.StatusOK, alert)
}
