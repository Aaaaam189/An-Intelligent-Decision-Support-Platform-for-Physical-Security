package main

import (
	"time"

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
	incidentService.GracePeriod = time.Duration(cfg.IncidentGraceSeconds) * time.Second

	router := gin.Default()
	routes.SetupRoutes(router, database, cfg.JWTSecret, cfg.InternalServiceKey, incidentService)

	router.Run(":" + cfg.ServerPort)
}
