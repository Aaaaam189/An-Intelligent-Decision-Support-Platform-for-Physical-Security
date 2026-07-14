package main

import (
	"log"

	"sentinelai/decision-engine/client"
	"sentinelai/decision-engine/config"
	"sentinelai/decision-engine/consumer"
	"sentinelai/shared/rabbitmq"
)

func main() {
	cfg := config.Load()

	log.Printf("DEBUG: exchange=%s queue=%s routingKey=%s", cfg.ExchangeName, cfg.QueueName, cfg.RoutingKey)

	conn, ch := rabbitmq.Connect(cfg.RabbitMQURL)
	defer conn.Close()
	defer ch.Close()

	rabbitmq.DeclareExchange(ch, cfg.ExchangeName)
	rabbitmq.DeclareAndBindQueue(ch, cfg.ExchangeName, cfg.QueueName, cfg.RoutingKey)

	incidentClient := client.NewIncidentClient(cfg.IncidentServiceURL, cfg.InternalServiceKey)

	log.Println("decision-engine started")
	consumer.Start(ch, cfg.QueueName, incidentClient)
}