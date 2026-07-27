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

func Start(ch *amqp.Channel, queueName string, svc *services.AnalyticsService) {
	msgs, err := ch.Consume(queueName, "", false, false, false, false, nil)
	if err != nil {
		log.Fatalf("failed to start consuming: %v", err)
	}

	log.Println("analytics-worker: waiting for events...")

	for msg := range msgs {
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