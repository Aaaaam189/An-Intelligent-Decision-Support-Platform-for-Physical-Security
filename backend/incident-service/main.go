package main

import (
	"github.com/gin-gonic/gin"

	"sentinelai/incident-service/config"
	"sentinelai/incident-service/db"
	"sentinelai/incident-service/routes"
)

func main() {
	cfg := config.Load()
	database := db.Connect(cfg)

	router := gin.Default()
	routes.SetupRoutes(router, database, cfg.JWTSecret)

	router.Run(":" + cfg.ServerPort)
}