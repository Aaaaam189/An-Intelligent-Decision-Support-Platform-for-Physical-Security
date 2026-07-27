package main

import (
	"github.com/gin-gonic/gin"

	"sentinelai/analytics-worker/config"
	"sentinelai/analytics-worker/consumer"
	"sentinelai/analytics-worker/db"
	"sentinelai/analytics-worker/routes"
	"sentinelai/analytics-worker/services"
	"sentinelai/shared/rabbitmq"
)

func main() {
	cfg := config.Load()
	database := db.Connect(cfg)

	conn, ch := rabbitmq.Connect(cfg.RabbitMQURL)
	defer conn.Close()
	defer ch.Close()

	rabbitmq.DeclareExchange(ch, cfg.ExchangeName)
	rabbitmq.DeclareAndBindQueue(ch, cfg.ExchangeName, cfg.QueueName, "incident.created")
	rabbitmq.DeclareAndBindQueue(ch, cfg.ExchangeName, cfg.QueueName, "incident.status_changed")
	rabbitmq.DeclareAndBindQueue(ch, cfg.ExchangeName, cfg.QueueName, "alert.critical_unassigned")

	analyticsService := services.NewAnalyticsService(database)

	go consumer.Start(ch, cfg.QueueName, analyticsService)

	router := gin.Default()
	routes.SetupRoutes(router, analyticsService, cfg.JWTSecret)
	router.Run(":" + cfg.ServerPort)
}