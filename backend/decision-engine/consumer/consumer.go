package consumer

import (
	"encoding/json"
	"errors"
	"log"

	amqp "github.com/rabbitmq/amqp091-go"

	"sentinelai/decision-engine/client"
	"sentinelai/decision-engine/cooldown"
	"sentinelai/decision-engine/models"
	"sentinelai/decision-engine/rulecache"
	"sentinelai/decision-engine/rules"
)

// Start consumes detection events and runs each through the pipeline:
// validate -> evaluate -> cooldown -> create -> dead-letter.
//
// For every delivery it:
//  1. Parses the JSON body; a malformed body is discarded without requeue so
//     it cannot poison the queue (Requirement 3.11).
//  2. Validates required fields and the detection type; an invalid event is
//     logged with its offending field and discarded without requeue
//     (Requirement 3.11).
//  3. Refreshes the engine from the current rule-cache snapshot and evaluates;
//     when no enabled rule matches, it acks and creates nothing
//     (Requirement 3.3).
//  4. Applies cooldown suppression per (zoneId, detectionType); a suppressed
//     event is acked and creates no incident (Requirements 4.2, 4.3).
//  5. Creates the incident with bounded retry; on success it starts the
//     cooldown window for the (zone, type) and acks (Requirements 3.1, 3.4,
//     4.2).
//  6. On retry exhaustion (client.ErrRetriesExhausted), it nacks without
//     requeue so the broker routes the message to the configured dead-letter
//     exchange (Requirements 3.12, 9.1).
func Start(
	ch *amqp.Channel,
	queueName string,
	engine *rules.Engine,
	ruleCache *rulecache.Cache,
	cooldownTracker *cooldown.Tracker,
	incidentClient *client.IncidentClient,
) {
	msgs, err := ch.Consume(
		queueName,
		"",    // consumer tag
		false, // auto-ack — false, since we ack manually after success
		false, // exclusive
		false, // no-local
		false, // no-wait
		nil,
	)
	if err != nil {
		log.Fatalf("failed to start consuming: %v", err)
	}

	log.Println("decision-engine: waiting for detection events...")

	for msg := range msgs {
		var event models.DetectionEvent
		if err := json.Unmarshal(msg.Body, &event); err != nil {
			// Malformed body: discard without requeue so it cannot poison the
			// queue (Requirement 3.11).
			log.Printf("failed to parse event, discarding: %v", err)
			msg.Nack(false, false)
			continue
		}

		// Reject invalid events (missing required fields or unknown type)
		// without requeue, logging the offending field (Requirement 3.11).
		if offendingField, valid := event.Validate(); !valid {
			log.Printf("invalid event, discarding: offending field=%s type=%s zone=%s",
				offendingField, event.Type, event.ZoneID)
			msg.Nack(false, false)
			continue
		}

		// Evaluate against the current rule set. Feed the engine the latest
		// cache snapshot so rule changes take effect without a restart
		// (Requirement 9.5).
		engine.SetRules(ruleCache.Snapshot())

		decision, matched := engine.Decide(event)
		if !matched {
			// No enabled rule matched: create no incident (Requirement 3.3).
			log.Printf("event=%s zone=%s -> no rule matched, no incident", event.Type, event.ZoneID)
			msg.Ack(false)
			continue
		}

		// Suppress repeat incidents for the same ongoing situation within the
		// cooldown window (Requirements 4.2, 4.3).
		if cooldownTracker.ShouldSuppress(event.CameraID, event.ZoneID, event.Type) {
			log.Printf("event=%s camera=%s zone=%s -> suppressed by cooldown, no incident",
				event.Type, event.CameraID, event.ZoneID)
			msg.Ack(false)
			continue
		}

		log.Printf("event=%s zone=%s -> incident type=%s priority=%s rule=%s",
			event.Type, event.ZoneID, decision.IncidentType, decision.Priority, decision.RuleID)

		if err := incidentClient.CreateIncident(event, decision); err != nil {
			if errors.Is(err, client.ErrRetriesExhausted) {
				// Creation failed after exhausting retries: route to the
				// dead-letter exchange by nacking without requeue
				// (Requirements 3.12, 9.1).
				log.Printf("incident creation exhausted retries, dead-lettering: %v", err)
				msg.Nack(false, false)
				continue
			}

			// Any other (non-terminal) error: requeue for another attempt.
			log.Printf("failed to create incident, will retry: %v", err)
			msg.Nack(false, true)
			continue
		}

		// Incident created: start the cooldown window for this (zone, type)
		// so subsequent duplicates are suppressed (Requirements 3.1, 3.4, 4.2).
		cooldownTracker.Record(event.CameraID, event.ZoneID, event.Type)
		msg.Ack(false)
	}
}
