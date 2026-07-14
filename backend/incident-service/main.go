package main

import (
	"github.com/gin-gonic/gin"

	"sentinelai/incident-service/config"
	"sentinelai/incident-service/db"
	"sentinelai/incident-service/routes"
	"sentinelai/incident-service/services"
	"sentinelai/shared/rabbitmq"
)

func main() {
	cfg := config.Load()
	database := db.Connect(cfg)

	conn, ch := rabbitmq.Connect(cfg.RabbitMQURL)
	defer conn.Close()
	defer ch.Close()
	rabbitmq.DeclareExchange(ch, cfg.ExchangeName)

	incidentService := services.NewIncidentService(database, ch, cfg.ExchangeName)

	router := gin.Default()
	routes.SetupRoutes(router, database, cfg.JWTSecret, cfg.InternalServiceKey, incidentService)

	router.Run(":" + cfg.ServerPort)
}