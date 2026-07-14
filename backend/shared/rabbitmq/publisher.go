package rabbitmq

import (
	"context"
	"encoding/json"
	"log"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

// Publish marshals any struct to JSON and sends it to the exchange
// with the given routing key — the "topic" that decides which
// consumers receive it.
func Publish(ch *amqp.Channel, exchange, routingKey string, body interface{}) error {
	data, err := json.Marshal(body)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err = ch.PublishWithContext(ctx,
		exchange,
		routingKey,
		false, // mandatory
		false, // immediate
		amqp.Publishing{
			ContentType: "application/json",
			Body:        data,
		},
	)
	if err != nil {
		log.Printf("failed to publish message: %v", err)
		return err
	}

	return nil
}