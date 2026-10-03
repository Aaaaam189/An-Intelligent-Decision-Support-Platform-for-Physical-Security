package consumer

import (
	"encoding/json"
	"errors"
	"log"

	amqp "github.com/rabbitmq/amqp091-go"

	"sentinelai/decision-engine/client"
	"sentinelai/decision-engine/models"
	"sentinelai/decision-engine/rulecache"
	"sentinelai/decision-engine/rules"
)

// Start consumes detection events and runs each through the pipeline:
// filter -> validate -> evaluate -> ingest -> dead-letter.
//
// decision-engine no longer keeps its own cooldown. It only answers "does this
// event match an enabled rule, and with what outcome?". Deciding whether that
// opens a new incident or belongs to a situation that is already open (and
// whether it escalates it) is incident-service's job: it owns the situation
// state in its database, so it survives restarts of this service.
//
// For every delivery it:
//  1. Parses the JSON body; a malformed body is discarded without requeue so
//     it cannot poison the queue (Requirement 3.11).
//  2. Acks and ignores presence-ended events (NO_PERSON / NO_VEHICLE). They are
//     informational; the situation lifecycle is driven by heartbeats.
//  3. Validates required fields and the detection type; an invalid event is
//     logged with its offending field and discarded without requeue
//     (Requirement 3.11).
//  4. Refreshes the engine from the current rule-cache snapshot and evaluates;
//     when no enabled rule matches, it acks and creates nothing
//     (Requirement 3.3).
//  5. Sends the event and the winning rule outcome to incident-service with
//     bounded retry; it opens or updates an incident and the message is acked
//     (Requirements 3.1, 3.4).
//  6. On retry exhaustion (client.ErrRetriesExhausted), it nacks without
//     requeue so the broker routes the message to the configured dead-letter
//     exchange (Requirements 3.12, 9.1).
func Start(
	ch *amqp.Channel,
	queueName string,
	engine *rules.Engine,
	ruleCache *rulecache.Cache,
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

		// Presence-ended events carry no rule-relevant information.
		if event.IsPresenceEnd() {
			msg.Ack(false)
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

		action, err := incidentClient.IngestEvent(event, decision)
		if err != nil {
			if errors.Is(err, client.ErrRetriesExhausted) {
				// Ingest failed after exhausting retries: route to the
				// dead-letter exchange by nacking without requeue
				// (Requirements 3.12, 9.1).
				log.Printf("event ingest exhausted retries, dead-lettering: %v", err)
				msg.Nack(false, false)
				continue
			}

			// Any other (non-terminal) error: requeue for another attempt.
			log.Printf("failed to ingest event, will retry: %v", err)
			msg.Nack(false, true)
			continue
		}

		if event.Heartbeat && action == "UPDATED" {
			// Heartbeats arrive every few seconds per camera; keep the log quiet.
			msg.Ack(false)
			continue
		}

		log.Printf("event=%s camera=%s zone=%s heartbeat=%t -> %s incident type=%s priority=%s rule=%s",
			event.Type, event.CameraID, event.ZoneID, event.Heartbeat, action,
			decision.IncidentType, decision.Priority, decision.RuleID)
		msg.Ack(false)
	}
}
