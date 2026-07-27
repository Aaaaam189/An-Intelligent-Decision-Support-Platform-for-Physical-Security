package consumer

import (
	"log"

	amqp "github.com/rabbitmq/amqp091-go"

	"sentinelai/notification-worker/hub"
)

func Start(ch *amqp.Channel, queueName string, h *hub.Hub) {
	msgs, err := ch.Consume(
		queueName,
		"",
		false, // manual ack
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		log.Fatalf("failed to start consuming: %v", err)
	}

	log.Println("notification-worker: waiting for events...")

	for msg := range msgs {
		log.Printf("received event, routing key=%s", msg.RoutingKey)
		h.Broadcast(msg.Body)
		msg.Ack(false)
	}
}