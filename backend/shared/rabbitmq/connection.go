package rabbitmq

import (
	"log"

	amqp "github.com/rabbitmq/amqp091-go"
)

// Connect opens a connection and a channel — this is the one thing
// every service needs before it can either publish or consume anything.
// Equivalent to building a ConnectionFactory + Connection in Spring AMQP.
func Connect(url string) (*amqp.Connection, *amqp.Channel) {
	conn, err := amqp.Dial(url)
	if err != nil {
		log.Fatalf("failed to connect to RabbitMQ: %v", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		log.Fatalf("failed to open a channel: %v", err)
	}

	return conn, ch
}

// DeclareExchange sets up a topic exchange — this is the "post office"
// that routes messages to whichever queues are interested, based on
// routing key patterns (e.g. "detection.person", "detection.crowd").
func DeclareExchange(ch *amqp.Channel, name string) {
	err := ch.ExchangeDeclare(
		name,
		"topic",
		true,  // durable — survives a RabbitMQ restart
		false, // auto-deleted
		false, // internal
		false, // no-wait
		nil,
	)
	if err != nil {
		log.Fatalf("failed to declare exchange: %v", err)
	}
}

// DeclareAndBindQueue creates a queue and binds it to the exchange
// with a routing key pattern — e.g. "detection.*" catches every
// detection event regardless of subtype.
func DeclareAndBindQueue(ch *amqp.Channel, exchange, queueName, routingKey string) amqp.Queue {
	q, err := ch.QueueDeclare(
		queueName,
		true,  // durable
		false, // auto-delete
		false, // exclusive
		false, // no-wait
		nil,
	)
	if err != nil {
		log.Fatalf("failed to declare queue: %v", err)
	}

	err = ch.QueueBind(q.Name, routingKey, exchange, false, nil)
	if err != nil {
		log.Fatalf("failed to bind queue: %v", err)
	}

	return q
}