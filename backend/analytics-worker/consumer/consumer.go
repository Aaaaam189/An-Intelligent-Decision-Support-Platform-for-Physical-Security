package consumer

import (
	"encoding/json"
	"log"
	"time"

	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"

	"sentinelai/analytics-worker/models"
	"sentinelai/analytics-worker/services"
)

type eventPayload struct {
	IncidentID      uuid.UUID  `json:"incidentId"`
	ZoneID          uuid.UUID  `json:"zoneId"`
	Priority        string     `json:"priority"`
	Status          string     `json:"status"`
	AssignedGuardID *uuid.UUID `json:"assignedGuardId"`
	CreatedAt       time.Time  `json:"createdAt"`
	ClosedAt        *time.Time `json:"closedAt"`
}

type alertPayload struct {
	IncidentID uuid.UUID `json:"incidentId"`
	ZoneID     uuid.UUID `json:"zoneId"`
	Priority   string    `json:"priority"`
	Message    string    `json:"message"`
}

// availabilityAlertPayload mirrors the availability alert lifecycle events
// published by the incident-service on alert.availability_created,
// alert.availability_acknowledged, and alert.availability_resolved. Only the
// fields relevant to the phase of the lifecycle are populated per message.
type availabilityAlertPayload struct {
	ID                   uuid.UUID  `json:"id"`
	TriggeringIncidentID uuid.UUID  `json:"triggeringIncidentId"`
	ZoneID               *uuid.UUID `json:"zoneId"`
	Priority             string     `json:"priority"`
	Message              string     `json:"message"`
	Status               string     `json:"status"`
	AcknowledgedBy       *uuid.UUID `json:"acknowledgedBy"`
	AcknowledgedAt       *time.Time `json:"acknowledgedAt"`
	ResolvedBy           *uuid.UUID `json:"resolvedBy"`
	ResolvedAt           *time.Time `json:"resolvedAt"`
	ResponseActions      string     `json:"responseActions"`
	CreatedAt            *time.Time `json:"createdAt"`
}

func Start(ch *amqp.Channel, queueName string, svc *services.AnalyticsService) {
	msgs, err := ch.Consume(queueName, "", false, false, false, false, nil)
	if err != nil {
		log.Fatalf("failed to start consuming: %v", err)
	}

	log.Println("analytics-worker: waiting for events...")

	for msg := range msgs {
		switch msg.RoutingKey {
		case "alert.availability_created",
			"alert.availability_acknowledged",
			"alert.availability_resolved":
			handleAvailabilityAlert(msg, svc)
			continue
		}

		if msg.RoutingKey == "alert.critical_unassigned" {
			var alert alertPayload
			if err := json.Unmarshal(msg.Body, &alert); err != nil {
				log.Printf("failed to parse alert, discarding: %v", err)
				msg.Nack(false, false)
				continue
			}

			if err := svc.SaveAlert(models.CriticalAlert{
				IncidentID: alert.IncidentID,
				ZoneID:     alert.ZoneID,
				Priority:   alert.Priority,
				Message:    alert.Message,
				CreatedAt:  time.Now(),
			}); err != nil {
				log.Printf("failed to save alert: %v", err)
				msg.Nack(false, true)
				continue
			}

			msg.Ack(false)
			continue
		}

		var event eventPayload
		if err := json.Unmarshal(msg.Body, &event); err != nil {
			log.Printf("failed to parse event, discarding: %v", err)
			msg.Nack(false, false)
			continue
		}

		stat := models.IncidentStat{
			IncidentID:        event.IncidentID,
			ZoneID:            event.ZoneID,
			Priority:          event.Priority,
			Status:            event.Status,
			AssignedGuardID:   event.AssignedGuardID,
			IncidentCreatedAt: event.CreatedAt,
			ClosedAt:          event.ClosedAt,
			UpdatedAt:         time.Now(),
		}

		if err := svc.Upsert(stat); err != nil {
			log.Printf("failed to upsert stat: %v", err)
			msg.Nack(false, true)
			continue
		}

		msg.Ack(false)
	}
}

// handleAvailabilityAlert persists and keeps the analytics copy of an
// availability alert in sync with the source-of-truth incident-service by
// consuming the create/acknowledge/resolve lifecycle events (Requirement 7.4).
func handleAvailabilityAlert(msg amqp.Delivery, svc *services.AnalyticsService) {
	var payload availabilityAlertPayload
	if err := json.Unmarshal(msg.Body, &payload); err != nil {
		log.Printf("failed to parse availability alert (%s), discarding: %v", msg.RoutingKey, err)
		msg.Nack(false, false)
		return
	}

	if payload.ID == uuid.Nil {
		log.Printf("availability alert (%s) missing id, discarding", msg.RoutingKey)
		msg.Nack(false, false)
		return
	}

	var err error
	switch msg.RoutingKey {
	case "alert.availability_created":
		createdAt := time.Now()
		if payload.CreatedAt != nil {
			createdAt = *payload.CreatedAt
		}
		status := models.AvailabilityAlertStatus(payload.Status)
		if status == "" {
			status = models.AvailabilityAlertStatusOpen
		}
		err = svc.SaveAvailabilityAlert(models.AvailabilityAlert{
			ID:                   payload.ID,
			TriggeringIncidentID: payload.TriggeringIncidentID,
			ZoneID:               payload.ZoneID,
			Priority:             payload.Priority,
			Message:              payload.Message,
			Status:               status,
			ResponseActions:      payload.ResponseActions,
			CreatedAt:            createdAt,
		})
	case "alert.availability_acknowledged":
		acknowledgedAt := time.Now()
		if payload.AcknowledgedAt != nil {
			acknowledgedAt = *payload.AcknowledgedAt
		}
		err = svc.AcknowledgeAvailabilityAlert(payload.ID, payload.AcknowledgedBy, acknowledgedAt)
	case "alert.availability_resolved":
		resolvedAt := time.Now()
		if payload.ResolvedAt != nil {
			resolvedAt = *payload.ResolvedAt
		}
		err = svc.ResolveAvailabilityAlert(payload.ID, payload.ResolvedBy, resolvedAt)
	}

	if err != nil {
		log.Printf("failed to sync availability alert (%s): %v", msg.RoutingKey, err)
		msg.Nack(false, true)
		return
	}

	msg.Ack(false)
}
