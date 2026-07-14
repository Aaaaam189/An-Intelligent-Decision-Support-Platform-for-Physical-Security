package consumer

import (
	"encoding/json"
	"log"

	amqp "github.com/rabbitmq/amqp091-go"

	"sentinelai/decision-engine/client"
	"sentinelai/decision-engine/models"
	"sentinelai/decision-engine/rules"
)

func Start(ch *amqp.Channel, queueName string, incidentClient *client.IncidentClient) {
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
			log.Printf("failed to parse event, discarding: %v", err)
			msg.Nack(false, false) // don't requeue a malformed message
			continue
		}

		decision := rules.Evaluate(event)
		log.Printf("event=%s zone=%s -> incident type=%s priority=%s",
			event.Type, event.ZoneID, decision.IncidentType, decision.Priority)

		if err := incidentClient.CreateIncident(event, decision); err != nil {
			log.Printf("failed to create incident, will retry: %v", err)
			msg.Nack(false, true) // requeue — maybe incident-service was briefly down
			continue
		}

		msg.Ack(false)
	}
}