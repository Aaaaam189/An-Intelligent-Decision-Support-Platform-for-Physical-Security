package main

import (
	"context"
	"log"

	amqp "github.com/rabbitmq/amqp091-go"

	"sentinelai/decision-engine/client"
	"sentinelai/decision-engine/config"
	"sentinelai/decision-engine/consumer"
	"sentinelai/decision-engine/cooldown"
	"sentinelai/decision-engine/rulecache"
	"sentinelai/decision-engine/rules"
	"sentinelai/shared/rabbitmq"
)

// Dead-letter topology. When the consumer nacks a Detection_Event without
// requeue after exhausting its retries (Req 3.12), RabbitMQ republishes the
// message to this dead-letter exchange, which routes it to a durable queue so
// the message is retained rather than silently discarded (Req 9.1).
const (
	deadLetterExchange = "sentinelai.events.dlx"
	deadLetterQueue    = "decision-engine.dlq"
)

func main() {
	cfg := config.Load()

	log.Printf("DEBUG: exchange=%s queue=%s routingKey=%s", cfg.ExchangeName, cfg.QueueName, cfg.RoutingKey)

	conn, ch := rabbitmq.Connect(cfg.RabbitMQURL)
	defer conn.Close()
	defer ch.Close()

	rabbitmq.DeclareExchange(ch, cfg.ExchangeName)

	// Declare the dead-letter topology before the main queue so the DLX exists
	// by the time the consuming queue references it.
	declareDeadLetterTopology(ch)

	// Declare the main consuming queue with an x-dead-letter-exchange argument
	// pointing at the DLX, then bind it to the events exchange. The shared
	// DeclareAndBindQueue helper does not accept queue arguments, so we declare
	// inline here to avoid changing shared behaviour used by other services.
	//
	// NOTE: a queue that already exists cannot be redeclared with different
	// arguments — RabbitMQ rejects a mismatched declaration. If cfg.QueueName
	// was previously created without the dead-letter argument, that existing
	// queue must be deleted (or renamed) before this service can start.
	declareAndBindMainQueue(ch, cfg.ExchangeName, cfg.QueueName, cfg.RoutingKey)

	incidentClient := client.NewIncidentClient(cfg.IncidentServiceURL, cfg.InternalServiceKey)

	// The rule engine starts with an empty snapshot; the consumer feeds it the
	// current rule-cache snapshot before each evaluation so rule changes take
	// effect without a restart.
	engine := rules.NewEngine(nil)

	// Hot-reloadable rule cache and cooldown de-duplication tracker.
	ruleCache := rulecache.New(cfg.IncidentServiceURL, cfg.InternalServiceKey, cfg.RulePollSeconds)
	cooldownTracker := cooldown.NewTrackerSeconds(cfg.CooldownSeconds)

	// Start the rule-cache poller before consuming so the snapshot is populated
	// (an initial refresh runs synchronously inside Start) and subsequent rule
	// changes are picked up without a restart (Req 9.5).
	ctx := context.Background()
	go ruleCache.Start(ctx)

	log.Println("decision-engine started")
	consumer.Start(ch, cfg.QueueName, engine, ruleCache, cooldownTracker, incidentClient)
}

// declareDeadLetterTopology declares the dead-letter exchange and a durable
// dead-letter queue bound to it. The DLX is a fanout so any dead-lettered
// message is retained regardless of the routing key it carried.
func declareDeadLetterTopology(ch *amqp.Channel) {
	err := ch.ExchangeDeclare(
		deadLetterExchange,
		"fanout",
		true,  // durable — survives a RabbitMQ restart
		false, // auto-deleted
		false, // internal
		false, // no-wait
		nil,
	)
	if err != nil {
		log.Fatalf("failed to declare dead-letter exchange: %v", err)
	}

	dlq, err := ch.QueueDeclare(
		deadLetterQueue,
		true,  // durable — dead-lettered events must be retained
		false, // auto-delete
		false, // exclusive
		false, // no-wait
		nil,
	)
	if err != nil {
		log.Fatalf("failed to declare dead-letter queue: %v", err)
	}

	// Fanout exchanges ignore the routing key, so bind with an empty key.
	if err := ch.QueueBind(dlq.Name, "", deadLetterExchange, false, nil); err != nil {
		log.Fatalf("failed to bind dead-letter queue: %v", err)
	}
}

// declareAndBindMainQueue declares the consuming queue with an
// x-dead-letter-exchange argument and binds it to the events exchange.
func declareAndBindMainQueue(ch *amqp.Channel, exchange, queueName, routingKey string) {
	q, err := ch.QueueDeclare(
		queueName,
		true,  // durable
		false, // auto-delete
		false, // exclusive
		false, // no-wait
		amqp.Table{"x-dead-letter-exchange": deadLetterExchange},
	)
	if err != nil {
		log.Fatalf("failed to declare queue: %v", err)
	}

	if err := ch.QueueBind(q.Name, routingKey, exchange, false, nil); err != nil {
		log.Fatalf("failed to bind queue: %v", err)
	}
}
